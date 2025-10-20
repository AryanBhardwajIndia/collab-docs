# CollabDocs

## Introduction

A document editor wherein multiple users can edit the same document simulataneously, only requirement being that the users must be logged in.

## Structure

## Project Structure

```
. 
├── backend/ 
│ ├── package-lock.json 
│ ├── package.json 
│ └── server.js 
├── frontend/ 
│ ├── public/ 
│ │ ├── index.html 
│ │ └── manifest.json 
│ └── src/ 
│ ├── App.css 
│ ├── App.js 
│ ├── App.test.js 
│ ├── index.css 
│ └── index.js 
├── package.json 
├── postcss.config.js 
└── tailwind.config.js
```

## Technology Used

React.js, Node.js, Express.js, MongoDB

## How it works?

Users create an account and then sign in to the dashboard where they can create a new document or access a share document. The users can share the document using the sharing link option in the menu bar and they can also export the document in either PDF or docx format.

The frontend is created using React.js and the backend works through Express.js, the database used is MongoDB. Users create an account using an API call to the backend which then send the data to the MongoDB database and whenever the user tries to login the credentials are checked using the backend API call.

The documents are also stored in the MongoDB database which runs locally on the device. When the user clicks on the share button a link is generated which can be pasted into another browser and using it the other user can access the document.

## Installation

1. Clone the repository

```bash
git clone http://www.github.com/AryanBhardwajIndia/collab-docs.git
```

2. Install all the dependencies

```bash
brew install npm
npm install lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

3. Install and start MongoDB

```bash
brew services start mongodb-community
```

4. Go into the backend folder and start the server

```bash
npm run dev
```

5. Similarly, deploy the frontend

```bash
npm start
```