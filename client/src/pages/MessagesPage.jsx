import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { apiRequest } from '../services/api.js';

export default function MessagesPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [refreshCount, setRefreshCount] = useState(0);
  const [conversations, setConversations] = useState({ key: null, rows: [], error: null });
  const [thread, setThread] = useState({ key: null, messages: [], error: null });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const conversationKey = String(refreshCount);
  const threadKey = id ? `${id}:${refreshCount}` : null;

  useEffect(() => {
    let active = true;
    apiRequest('/conversations/mine')
      .then(({ conversations: rows }) => {
        if (active) setConversations({ key: conversationKey, rows, error: null });
      })
      .catch((error) => {
        if (active) setConversations({ key: conversationKey, rows: [], error });
      });
    return () => { active = false; };
  }, [conversationKey]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    apiRequest(`/conversations/${id}/messages`)
      .then(({ messages }) => {
        if (active) setThread({ key: threadKey, messages, error: null });
      })
      .catch((error) => {
        if (active) setThread({ key: threadKey, messages: [], error });
      });
    return () => { active = false; };
  }, [id, threadKey]);

  const conversationsLoading = conversations.key !== conversationKey;
  const threadLoading = Boolean(id) && thread.key !== threadKey;
  const selected = conversations.rows.find((conversation) => conversation.id === id);

  async function send(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!id || !body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const message = await apiRequest(`/conversations/${id}/messages`, { method: 'POST', body: { body } });
      setThread((current) => ({ ...current, messages: [...current.messages, message] }));
      setDraft('');
    } catch (error) {
      setSendError(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap messages-page">
      <div className="marketplace-heading"><div><div className="eyebrow">CAMPUS MESSAGES</div><h1>Messages</h1><p>Coordinate borrowing with the other student in your request.</p></div><Link className="outline-button" to="/bookings">Bookings</Link></div>
      <div className="messages-layout">
        <aside className="conversation-list" aria-label="Conversations">
          {conversationsLoading ? <p className="message-empty">Loading conversations…</p>
            : conversations.error ? <div className="message-empty error" role="alert">{conversations.error.message}<button className="text-button" onClick={() => setRefreshCount((count) => count + 1)}>Try again</button></div>
              : conversations.rows.length === 0 ? <p className="message-empty">Your booking conversations will appear here.</p>
                : conversations.rows.map((conversation) => <Link className={conversation.id === id ? 'conversation-link selected' : 'conversation-link'} to={`/messages/${conversation.id}`} key={conversation.id}>
                  <b>{conversation.title}</b><span>{conversation.other?.fullName ?? 'Campus student'}</span><small>Open conversation →</small>
                  </Link>)}
        </aside>
        <section className="message-thread" aria-label="Message thread">
          {!id ? <div className="message-empty thread-empty"><b>Select a conversation</b><span>Messages are available after a borrowing request is created.</span></div>
            : threadLoading ? <p className="message-empty">Loading messages…</p>
              : thread.error ? <div className="message-empty error" role="alert">{thread.error.message}<button className="text-button" onClick={() => setRefreshCount((count) => count + 1)}>Try again</button></div>
                : (
                  <>
                    <div className="thread-heading"><div><h2>{selected?.title ?? 'Campus conversation'}</h2><p>With {selected?.other?.fullName ?? 'a campus student'}</p></div><button className="text-button" onClick={() => setRefreshCount((count) => count + 1)}>Refresh</button></div>
                    <div className="message-list" aria-live="polite">
                      {thread.messages.length === 0 ? <p className="message-empty">No messages yet. Say hello and coordinate a safe campus handover.</p>
                        : thread.messages.map((message) => <article className={message.sender_id === user?.id ? 'message-bubble own' : 'message-bubble'} key={message.id}>
                          <p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()}</small>
                        </article>)}
                    </div>
                    <form className="message-compose" onSubmit={send}>
                      {sendError && <div className="form-alert error" role="alert">{sendError}</div>}
                      <label className="sr-only" htmlFor="message-body">Write a message</label>
                      <textarea id="message-body" rows="3" maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message about the handover…" required />
                      <div><small>Keep conversations respectful and don’t share passwords or payment credentials.</small><button className="button" disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send message'}</button></div>
                    </form>
                  </>
                )}
        </section>
      </div>
    </main>
  );
}
