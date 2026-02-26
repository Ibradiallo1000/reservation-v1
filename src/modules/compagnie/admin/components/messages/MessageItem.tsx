// src/components/messages/MessageItem.tsx
import React from 'react';
import type { MessageClient } from '@/modules/compagnie/pages/MessagesCompagniePage';

interface MessageItemProps {
  message: MessageClient;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  return (
    <li className="bg-white rounded-xl border shadow-sm p-4">
      <p className="font-semibold">{message.nom} ({message.email})</p>
      <p className="text-sm text-gray-500 mb-2">
        {message.createdAt?.toDate().toLocaleString()}
      </p>
      <p>{message.message}</p>
    </li>
  );
};

export default MessageItem;
