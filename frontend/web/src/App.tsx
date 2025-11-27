import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  creator: string;
  timestamp: number;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
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
    status: "pending", 
    message: "" 
  });
  const [newEventData, setNewEventData] = useState({ title: "", startTime: "", endTime: "" });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 5;

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
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
            id: businessId,
            title: businessData.name,
            startTime: Number(businessData.publicValue1),
            endTime: Number(businessData.publicValue2),
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            publicValue1: Number(businessData.publicValue1),
            publicValue2: Number(businessData.publicValue2),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue)
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
      
      const duration = parseInt(newEventData.endTime) - parseInt(newEventData.startTime);
      const businessId = `event-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, duration);
      
      const tx = await contract.createBusinessData(
        businessId,
        newEventData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newEventData.startTime),
        parseInt(newEventData.endTime),
        "Team Calendar Event"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Event created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewEventData({ title: "", startTime: "", endTime: "" });
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
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        return Number(businessData.decryptedValue) || 0;
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
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Contract is available and responding" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredEvents = events.filter(event => 
    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastEvent = currentPage * eventsPerPage;
  const indexOfFirstEvent = indexOfLastEvent - eventsPerPage;
  const currentEvents = filteredEvents.slice(indexOfFirstEvent, indexOfLastEvent);
  const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Team Calendar 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to access the encrypted team calendar system.</p>
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
          <button onClick={checkAvailability} className="availability-btn">
            Check Availability
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Event
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="events-section">
          <h2>Team Events ({filteredEvents.length})</h2>
          
          <div className="events-list">
            {currentEvents.length === 0 ? (
              <div className="no-events">
                <p>No events found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Event
                </button>
              </div>
            ) : currentEvents.map((event, index) => (
              <div 
                className={`event-item ${event.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedEvent(event)}
              >
                <div className="event-title">{event.title}</div>
                <div className="event-time">
                  {new Date(event.startTime * 1000).toLocaleString()} - {new Date(event.endTime * 1000).toLocaleString()}
                </div>
                <div className="event-status">
                  {event.isVerified ? "✅ Verified" : "🔓 Ready for Verification"}
                  {event.isVerified && event.decryptedValue && (
                    <span className="duration">Duration: {event.decryptedValue}h</span>
                  )}
                </div>
                <div className="event-creator">By: {event.creator.substring(0, 6)}...{event.creator.substring(38)}</div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
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
          onClose={() => setSelectedEvent(null)} 
          isDecrypting={fheIsDecrypting} 
          decryptData={() => decryptData(selectedEvent.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
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
    setEventData({ ...eventData, [name]: value });
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
            <p>Event duration will be encrypted with Zama FHE</p>
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
            <label>Start Time (Unix timestamp) *</label>
            <input 
              type="number" 
              name="startTime" 
              value={eventData.startTime} 
              onChange={handleChange} 
              placeholder="Enter start time..." 
            />
          </div>
          
          <div className="form-group">
            <label>End Time (Unix timestamp) *</label>
            <input 
              type="number" 
              name="endTime" 
              value={eventData.endTime} 
              onChange={handleChange} 
              placeholder="Enter end time..." 
            />
            <div className="data-type-label">Duration will be FHE Encrypted</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !eventData.title || !eventData.startTime || !eventData.endTime} 
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
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ event, onClose, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    await decryptData();
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
              <span>Start Time:</span>
              <strong>{new Date(event.startTime * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>End Time:</span>
              <strong>{new Date(event.endTime * 1000).toLocaleString()}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Duration Data</h3>
            
            <div className="data-row">
              <div className="data-label">Event Duration:</div>
              <div className="data-value">
                {event.isVerified && event.decryptedValue ? 
                  `${event.decryptedValue} hours (On-chain Verified)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${event.isVerified ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Verifying..." : event.isVerified ? "✅ Verified" : "🔓 Verify Duration"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Protected Duration</strong>
                <p>Event duration is encrypted using Zama FHE technology</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;