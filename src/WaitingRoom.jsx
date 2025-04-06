import React from 'react';

function WaitingRoom({ name }) {
  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md text-center">
      <h1 className="text-2xl font-bold mb-4">Hello, {name}!</h1>
      <p className="text-gray-600 mb-6">Looking for someone to chat with...</p>
      <div className="flex justify-center">
        <div className="animate-pulse flex space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}

export default WaitingRoom;