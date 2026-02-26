// ✅ src/components/messages/MessagesList.tsx
import React from 'react';
import { MessageClient } from '@/modules/compagnie/pages/MessagesCompagniePage';
import MessageItem from './MessageItem';

interface MessagesListProps {
  messages: MessageClient[];
  loading: boolean;
}

const MessagesList: React.FC<MessagesListProps> = ({ messages, loading }) => {
  if (loading) return <p>Chargement...</p>;
  if (messages.length === 0) return <p>Aucun message pour l'instant.</p>;

  return (
    <ul className="space-y-4">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </ul>
  );
};

export default MessagesList;
