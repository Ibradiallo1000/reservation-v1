var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/pages/AdminMessageriePage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, query, where, orderBy, Timestamp, } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format } from 'date-fns';
const AdminMessageriePage = () => {
    const [messages, setMessages] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [response, setResponse] = useState('');
    const [userList, setUserList] = useState([]);
    useEffect(() => {
        fetchUsers();
    }, []);
    useEffect(() => {
        if (selectedUser)
            fetchMessages(selectedUser);
    }, [selectedUser]);
    const fetchUsers = () => __awaiter(void 0, void 0, void 0, function* () {
        const snapshot = yield getDocs(collection(db, 'messages'));
        const allMessages = snapshot.docs.map(doc => doc.data());
        const uniqueUsers = Array.from(new Set(allMessages.map(m => m.sender)));
        setUserList(uniqueUsers);
    });
    const fetchMessages = (userId) => __awaiter(void 0, void 0, void 0, function* () {
        const q = query(collection(db, 'messages'), where('sender', '==', userId), orderBy('timestamp', 'desc'));
        const snapshot = yield getDocs(q);
        const data = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setMessages(data);
    });
    const handleSend = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!response || !selectedUser)
            return;
        yield addDoc(collection(db, 'messages'), {
            sender: 'admin',
            receiver: selectedUser,
            content: response,
            timestamp: Timestamp.now(),
        });
        setResponse('');
        fetchMessages(selectedUser);
    });
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Messagerie" }), _jsxs("div", { className: "flex gap-6", children: [_jsxs("div", { className: "w-1/3 border-r pr-4", children: [_jsx("h2", { className: "font-semibold mb-2", children: "Utilisateurs" }), _jsx("ul", { children: userList.map(user => (_jsx("li", { onClick: () => setSelectedUser(user), className: `cursor-pointer p-2 rounded ${selectedUser === user ? 'bg-blue-100' : 'hover:bg-gray-100'}`, children: user }, user))) })] }), _jsxs("div", { className: "w-2/3", children: [_jsxs("h2", { className: "font-semibold mb-2", children: ["Discussion avec ", selectedUser || '...'] }), _jsx("div", { className: "bg-white border rounded h-96 overflow-y-auto p-4 mb-4", children: messages.length > 0 ? (messages.map(msg => (_jsx("div", { className: `mb-3 ${msg.sender === 'admin' ? 'text-right' : 'text-left'}`, children: _jsxs("div", { className: "inline-block px-3 py-2 rounded bg-gray-100", children: [_jsx("p", { className: "text-sm", children: msg.content }), _jsx("p", { className: "text-xs text-gray-500", children: format(msg.timestamp.toDate(), 'dd/MM/yyyy HH:mm') })] }) }, msg.id)))) : (_jsx("p", { className: "text-gray-500", children: "Aucun message trouv\u00E9." })) }), selectedUser && (_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", placeholder: "Votre r\u00E9ponse...", className: "border px-3 py-2 rounded w-full", value: response, onChange: e => setResponse(e.target.value) }), _jsx("button", { onClick: handleSend, className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700", children: "Envoyer" })] }))] })] })] }));
};
export default AdminMessageriePage;
