# TeamCal_FHE: A Privacy-Preserving Team Calendar

TeamCal_FHE is an innovative scheduling application that empowers teams to manage their calendars without compromising on privacy. Harnessing the power of Zama's Fully Homomorphic Encryption (FHE) technology, TeamCal_FHE enables encrypted scheduling, allowing teams to find mutual availability while keeping sensitive meeting details confidential.

## The Problem

In today's digital workplace, maintaining privacy is crucial. Team members often share sensitive information when coordinating meetings, such as topics, attendees, and specific times. Traditional calendar solutions expose this cleartext data, leading to potential breaches of confidentiality and trust. The absence of robust encryption mechanisms makes it difficult for teams to collaborate effectively without compromising their privacy.

## The Zama FHE Solution

TeamCal_FHE addresses these challenges by utilizing Zama's FHE technology, enabling computation on encrypted data. This means that the application can perform calculations, such as identifying free time slots for meetings, without ever needing to reveal the actual contents of the calendar. Using the latest Zama libraries, TeamCal_FHE processes encrypted inputs to return availability results, ensuring that information remains private and secure throughout the scheduling process.

## Key Features

- 🔒 **Privacy Protection**: All schedules and meeting details are encrypted, ensuring no unauthorized access to sensitive information.
- 📅 **Availability Matching**: Allows users to find common free time slots without exposing the details of their schedules.
- 🤝 **Collaborative Efficiency**: Streamlines the process of scheduling meetings among team members with minimal friction.
- 🕒 **Real-Time Updates**: Automatically adjusts availability in real-time when changes occur in the calendar.
- 📲 **User-Friendly Interface**: Intuitive design that makes it easy for all team members to participate in scheduling.

## Technical Architecture & Stack

TeamCal_FHE is built upon a robust technical architecture that leverages state-of-the-art technologies for privacy and efficiency. The core stack includes:

- **Backend**: Zama's FHE technology (Concrete ML and fhevm)
- **Frontend**: Frameworks like React.js for a dynamic user interface
- **Database**: Encrypted storage solutions to ensure dataset protection

Zama's libraries form the backbone of this application, enabling all operations to be conducted securely while maintaining high performance.

## Smart Contract / Core Logic

Here’s a simplified code snippet that illustrates how TeamCal_FHE integrates Zama's FHE libraries within its core logic:solidity
pragma solidity ^0.8.0;

// Importing the FHE library for encrypted data processing
import "TFHE.sol";

contract TeamCal_FHE {
    // Function to encrypt and add availability times
    function findAvailability(uint64[] memory encryptedTimes) public view returns (uint64) {
        uint64 totalAvailability = 0;

        for (uint i = 0; i < encryptedTimes.length; i++) {
            totalAvailability = TFHE.add(totalAvailability, encryptedTimes[i]);
        }
        
        return TFHE.decrypt(totalAvailability);
    }
}

In this example, the function `findAvailability` takes encrypted time slots as input and calculates the total availability while preserving privacy using Zama's TFHE functions.

## Directory Structure

Here’s how the directory structure for TeamCal_FHE looks:
TeamCal_FHE/
├── .sol                        # Smart contract for scheduling logic
├── client/                     # Frontend application
│   ├── App.js
│   └── components/
├── server/                     # Backend application
│   ├── index.js
│   └── models/
│       └── scheduleModel.js
├── package.json                # Project dependencies
└── README.md                   # Project documentation

## Installation & Setup

To set up TeamCal_FHE, you’ll need to ensure that you have the necessary environment configured:

### Prerequisites

- Node.js installed for both server and client development
- A package manager like npm or Yarn

### Installation Steps

1. **Install Dependencies**:
   - Navigate to the project root directory.
   - For server dependencies, run:
     npm install
   - For client dependencies, navigate to the `client` directory and run:
     npm install

2. **Install Zama Libraries**:
   - For backend functionalities, ensure the Zama libraries are included by running:
     npm install fhevm

## Build & Run

To build and run TeamCal_FHE, follow these commands:

1. For the backend:
   node server/index.js

2. For the frontend:
   npm start

This will compile the application and start the server, allowing you to interact with TeamCal_FHE in your browser.

## Acknowledgements

This project would not have been possible without the groundbreaking work by Zama in providing open-source FHE primitives. Their technology forms the foundation of TeamCal_FHE, allowing us to build a secure, reliable, and privacy-preserving calendar application.

Thank you for exploring TeamCal_FHE! We look forward to your feedback and contributions to improve this innovative scheduling solution.


