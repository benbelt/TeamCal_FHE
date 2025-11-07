pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TeamCal_FHE is ZamaEthereumConfig {
    struct CalendarEvent {
        string eventId;                 
        euint32 encryptedStartTime;     
        euint32 encryptedEndTime;       
        uint32 publicDuration;          
        string title;                   
        address creator;                
        uint256 timestamp;              
        uint32 decryptedStartTime;      
        uint32 decryptedEndTime;        
        bool isVerified;                
    }

    mapping(string => CalendarEvent) public calendarEvents;
    string[] public eventIds;

    event EventCreated(string indexed eventId, address indexed creator);
    event DecryptionVerified(string indexed eventId, uint32 startTime, uint32 endTime);
    event AvailabilityChecked(string indexed eventId, bool isAvailable);

    constructor() ZamaEthereumConfig() {
    }

    function createEvent(
        string calldata eventId,
        externalEuint32 encryptedStartTime,
        bytes calldata startTimeProof,
        externalEuint32 encryptedEndTime,
        bytes calldata endTimeProof,
        uint32 publicDuration,
        string calldata title
    ) external {
        require(bytes(calendarEvents[eventId].title).length == 0, "Event already exists");
        
        euint32 startTime = FHE.fromExternal(encryptedStartTime, startTimeProof);
        euint32 endTime = FHE.fromExternal(encryptedEndTime, endTimeProof);
        
        require(FHE.isInitialized(startTime), "Invalid encrypted start time");
        require(FHE.isInitialized(endTime), "Invalid encrypted end time");
        
        calendarEvents[eventId] = CalendarEvent({
            eventId: eventId,
            encryptedStartTime: startTime,
            encryptedEndTime: endTime,
            publicDuration: publicDuration,
            title: title,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedStartTime: 0,
            decryptedEndTime: 0,
            isVerified: false
        });
        
        FHE.allowThis(calendarEvents[eventId].encryptedStartTime);
        FHE.allowThis(calendarEvents[eventId].encryptedEndTime);
        
        FHE.makePubliclyDecryptable(calendarEvents[eventId].encryptedStartTime);
        FHE.makePubliclyDecryptable(calendarEvents[eventId].encryptedEndTime);
        
        eventIds.push(eventId);
        
        emit EventCreated(eventId, msg.sender);
    }

    function verifyDecryption(
        string calldata eventId,
        bytes memory abiEncodedStart,
        bytes memory startProof,
        bytes memory abiEncodedEnd,
        bytes memory endProof
    ) external {
        require(bytes(calendarEvents[eventId].title).length > 0, "Event does not exist");
        require(!calendarEvents[eventId].isVerified, "Event already verified");
        
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(calendarEvents[eventId].encryptedStartTime);
        cts[1] = FHE.toBytes32(calendarEvents[eventId].encryptedEndTime);
        
        bytes[] memory proofs = new bytes[](2);
        proofs[0] = startProof;
        proofs[1] = endProof;
        
        bytes[] memory clearValues = new bytes[](2);
        clearValues[0] = abiEncodedStart;
        clearValues[1] = abiEncodedEnd;
        
        FHE.checkSignatures(cts, clearValues, proofs);
        
        uint32 decodedStart = abi.decode(abiEncodedStart, (uint32));
        uint32 decodedEnd = abi.decode(abiEncodedEnd, (uint32));
        
        calendarEvents[eventId].decryptedStartTime = decodedStart;
        calendarEvents[eventId].decryptedEndTime = decodedEnd;
        calendarEvents[eventId].isVerified = true;
        
        emit DecryptionVerified(eventId, decodedStart, decodedEnd);
    }

    function checkAvailability(
        string calldata eventId,
        externalEuint32 encryptedQueryTime,
        bytes calldata queryProof
    ) external returns (bool) {
        require(bytes(calendarEvents[eventId].title).length > 0, "Event does not exist");
        
        euint32 queryTime = FHE.fromExternal(encryptedQueryTime, queryProof);
        require(FHE.isInitialized(queryTime), "Invalid encrypted query time");
        
        euint32 startTime = calendarEvents[eventId].encryptedStartTime;
        euint32 endTime = calendarEvents[eventId].encryptedEndTime;
        
        FHE.allowThis(queryTime);
        
        bool available = FHE.lt(queryTime, startTime) || FHE.gt(queryTime, endTime);
        
        emit AvailabilityChecked(eventId, available);
        
        return available;
    }

    function getEvent(string calldata eventId) external view returns (
        string memory title,
        uint32 publicDuration,
        address creator,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedStartTime,
        uint32 decryptedEndTime
    ) {
        require(bytes(calendarEvents[eventId].title).length > 0, "Event does not exist");
        CalendarEvent storage ev = calendarEvents[eventId];
        
        return (
            ev.title,
            ev.publicDuration,
            ev.creator,
            ev.timestamp,
            ev.isVerified,
            ev.decryptedStartTime,
            ev.decryptedEndTime
        );
    }

    function getAllEventIds() external view returns (string[] memory) {
        return eventIds;
    }

    function getEncryptedTimes(string calldata eventId) external view returns (euint32, euint32) {
        require(bytes(calendarEvents[eventId].title).length > 0, "Event does not exist");
        return (calendarEvents[eventId].encryptedStartTime, calendarEvents[eventId].encryptedEndTime);
    }
}


