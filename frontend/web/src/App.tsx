import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface CalendarEvent {
  id: number;
  title: string;
  startTime: string;
  duration: string;
  participants: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface TimeSlot {
  hour: number;
  available: boolean;
  events: number;
}

interface CalendarStats {
  totalEvents: number;
  verifiedEvents: number;
  avgDuration: number;
  busyHours: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newEventData, setNewEventData] = useState({ title: "", startTime: "", duration: "", participants: "" });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ startTime: number | null; duration: number | null }>({ startTime: null, duration: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [stats, setStats] = useState<CalendarStats>({ totalEvents: 0, verifiedEvents: 0, avgDuration: 0, busyHours: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) {
        return;
      }
      
      if (isInitialized) {
        return;
      }
      
      if (fhevmInitializing) {
        return;
      }
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM after wallet connection...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed. Please check your wallet connection." 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  useEffect(() => {
    if (events.length > 0) {
      calculateTimeSlots();
      calculateStats();
    }
  }, [events]);

  const calculateTimeSlots = () => {
    const slots: TimeSlot[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      const hourEvents = events.filter(event => {
        const eventHour = Math.floor((event.publicValue1 % 24));
        return eventHour === hour;
      });
      slots.push({
        hour,
        available: hourEvents.length === 0,
        events: hourEvents.length
      });
    }
    setTimeSlots(slots);
  };

  const calculateStats = () => {
    const totalEvents = events.length;
    const verifiedEvents = events.filter(e => e.isVerified).length;
    const avgDuration = events.length > 0 
      ? events.reduce((sum, e) => sum + e.publicValue2, 0) / events.length 
      : 0;
    const busyHours = timeSlots.filter(slot => slot.events > 0).length;

    setStats({
      totalEvents,
      verifiedEvents,
      avgDuration,
      busyHours
    });
  };

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const eventsList: CalendarEvent[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          eventsList.push({
            id: parseInt(businessId.replace('event-', '')) || Date.now(),
            title: businessData.name,
            startTime: businessId,
            duration: businessId,
            participants: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setEvents(eventsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createEvent = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingEvent(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating event with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const startTimeValue = parseInt(newEventData.startTime) || 0;
      const businessId = `event-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, startTimeValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newEventData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newEventData.duration) || 60,
        0,
        `Participants: ${newEventData.participants}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Event created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewEventData({ title: "", startTime: "", duration: "", participants: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingEvent(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card metal-card">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <h3>Total Events</h3>
            <div className="stat-value">{stats.totalEvents}</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <h3>Verified</h3>
            <div className="stat-value">{stats.verifiedEvents}/{stats.totalEvents}</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <h3>Avg Duration</h3>
            <div className="stat-value">{stats.avgDuration.toFixed(0)}min</div>
          </div>
        </div>
        
        <div className="stat-card metal-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <h3>Busy Hours</h3>
            <div className="stat-value">{stats.busyHours}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderTimeChart = () => {
    return (
      <div className="time-chart">
        <h3>Daily Schedule Heatmap</h3>
        <div className="heatmap">
          {timeSlots.map((slot, index) => (
            <div key={index} className="time-slot">
              <div className="time-label">{slot.hour}:00</div>
              <div 
                className={`availability-indicator ${slot.available ? 'available' : 'busy'}`}
                style={{ opacity: slot.events * 0.3 + 0.3 }}
              >
                {slot.events > 0 && <span className="event-count">{slot.events}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Time Encryption</h4>
            <p>Event start time encrypted with Zama FHE 🔐</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Secure Storage</h4>
            <p>Encrypted time stored on-chain, marked decryptable</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Offline Decryption</h4>
            <p>Client performs offline decryption using relayer-sdk</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>On-chain Verification</h4>
            <p>Submit proof for FHE.checkSignatures validation</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Team Calendar 🔐</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to initialize the encrypted calendar system and access team schedules.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet using the button above</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will automatically initialize</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Start creating and viewing encrypted team events</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p>Status: {fhevmInitializing ? "Initializing FHEVM" : status}</p>
        <p className="loading-note">This may take a few moments</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted calendar system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Team Calendar 🔐</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Event
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <h2>Team Schedule Overview (FHE 🔐)</h2>
          {renderStats()}
          
          <div className="search-section">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search events..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <span className="search-icon">🔍</span>
            </div>
          </div>

          {renderTimeChart()}
          
          <div className="panel metal-panel full-width">
            <h3>FHE 🔐 Time Encryption Flow</h3>
            {renderFHEFlow()}
          </div>
        </div>
        
        <div className="events-section">
          <div className="section-header">
            <h2>Team Events</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="events-list">
            {filteredEvents.length === 0 ? (
              <div className="no-events">
                <p>No events found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Event
                </button>
              </div>
            ) : filteredEvents.map((event, index) => (
              <div 
                className={`event-item ${selectedEvent?.id === event.id ? "selected" : ""} ${event.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedEvent(event)}
              >
                <div className="event-title">{event.title}</div>
                <div className="event-meta">
                  <span>Duration: {event.publicValue2}min</span>
                  <span>Created: {new Date(event.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="event-status">
                  Status: {event.isVerified ? "✅ Time Verified" : "🔓 Ready for Verification"}
                  {event.isVerified && event.decryptedValue && (
                    <span className="verified-time">Start: {event.decryptedValue}:00</span>
                  )}
                </div>
                <div className="event-creator">Creator: {event.creator.substring(0, 6)}...{event.creator.substring(38)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateEvent 
          onSubmit={createEvent} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingEvent} 
          eventData={newEventData} 
          setEventData={setNewEventData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedEvent && (
        <EventDetailModal 
          event={selectedEvent} 
          onClose={() => { 
            setSelectedEvent(null); 
            setDecryptedData({ startTime: null, duration: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedEvent.startTime)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateEvent: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  eventData: any;
  setEventData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, eventData, setEventData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'startTime') {
      const intValue = value.replace(/[^\d]/g, '');
      setEventData({ ...eventData, [name]: intValue });
    } else {
      setEventData({ ...eventData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-event-modal">
        <div className="modal-header">
          <h2>New Team Event</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Encryption</strong>
            <p>Event start time will be encrypted with Zama FHE 🔐 (Integer only)</p>
          </div>
          
          <div className="form-group">
            <label>Event Title *</label>
            <input 
              type="text" 
              name="title" 
              value={eventData.title} 
              onChange={handleChange} 
              placeholder="Enter event title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Start Time (24h format, integer) *</label>
            <input 
              type="number" 
              name="startTime" 
              value={eventData.startTime} 
              onChange={handleChange} 
              placeholder="Enter start time (8-20)..." 
              min="8"
              max="20"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Duration (minutes) *</label>
            <input 
              type="number" 
              min="15" 
              max="240" 
              name="duration" 
              value={eventData.duration} 
              onChange={handleChange} 
              placeholder="Enter duration..." 
            />
            <div className="data-type-label">Public Data</div>
          </div>

          <div className="form-group">
            <label>Participants</label>
            <input 
              type="text" 
              name="participants" 
              value={eventData.participants} 
              onChange={handleChange} 
              placeholder="Enter participant names..." 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !eventData.title || !eventData.startTime || !eventData.duration} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
};

const EventDetailModal: React.FC<{
  event: CalendarEvent;
  onClose: () => void;
  decryptedData: { startTime: number | null; duration: number | null };
  setDecryptedData: (value: { startTime: number | null; duration: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ event, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedData.startTime !== null) { 
      setDecryptedData({ startTime: null, duration: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ startTime: decrypted, duration: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="event-detail-modal">
        <div className="modal-header">
          <h2>Event Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="event-info">
            <div className="info-item">
              <span>Event Title:</span>
              <strong>{event.title}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{event.creator.substring(0, 6)}...{event.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(event.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Duration:</span>
              <strong>{event.publicValue2} minutes</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Start Time</h3>
            
            <div className="data-row">
              <div className="data-label">Start Time:</div>
              <div className="data-value">
                {event.isVerified && event.decryptedValue ? 
                  `${event.decryptedValue}:00 (On-chain Verified)` : 
                  decryptedData.startTime !== null ? 
                  `${decryptedData.startTime}:00 (Locally Decrypted)` : 
                  "🔒 FHE Encrypted Integer"
                }
              </div>
              <button 
                className={`decrypt-btn ${(event.isVerified || decryptedData.startTime !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Verifying..."
                ) : event.isVerified ? (
                  "✅ Verified"
                ) : decryptedData.startTime !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Verify Decryption"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Self-Relaying Decryption</strong>
                <p>Start time is encrypted on-chain. Click "Verify Decryption" to perform offline decryption and on-chain verification.</p>
              </div>
            </div>
          </div>
          
          {(event.isVerified || decryptedData.startTime !== null) && (
            <div className="analysis-section">
              <h3>Time Slot Analysis</h3>
              
              <div className="time-visualization">
                <div className="time-slot-visual">
                  <div className="time-marker" style={{ left: `${((event.isVerified ? event.decryptedValue! : decryptedData.startTime!) - 8) * 6}%` }}>
                    <div className="time-dot"></div>
                    <div className="time-label">
                      Start: {event.isVerified ? event.decryptedValue : decryptedData.startTime}:00
                    </div>
                  </div>
                  <div className="duration-bar" style={{ 
                    width: `${event.publicValue2 / 4}%`,
                    left: `${((event.isVerified ? event.decryptedValue! : decryptedData.startTime!) - 8) * 6}%`
                  }}>
                    <span>{event.publicValue2}min</span>
                  </div>
                </div>
              </div>
              
              <div className="decrypted-values">
                <div className="value-item">
                  <span>Start Time:</span>
                  <strong>
                    {event.isVerified ? 
                      `${event.decryptedValue}:00 (On-chain Verified)` : 
                      `${decryptedData.startTime}:00 (Locally Decrypted)`
                    }
                  </strong>
                  <span className={`data-badge ${event.isVerified ? 'verified' : 'local'}`}>
                    {event.isVerified ? 'On-chain Verified' : 'Local Decryption'}
                  </span>
                </div>
                <div className="value-item">
                  <span>Duration:</span>
                  <strong>{event.publicValue2} minutes</strong>
                  <span className="data-badge public">Public Data</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!event.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


