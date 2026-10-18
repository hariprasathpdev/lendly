import { adminClient } from '../config/supabase.js';
import { asyncHandler } from '../utils/async-handler.js';
import { messageCreateSchema } from '../validators/conversations.js';

const conversationSelect = [
  'id,listing_id,booking_id,borrower_id,lender_id,created_at',
  'listing:listings!conversations_listing_id_fkey(id,title)',
  'borrower:profiles!conversations_borrower_id_fkey(id,full_name)',
  'lender:profiles!conversations_lender_id_fkey(id,full_name)',
].join(',');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function requireDb(next) {
  if (adminClient) return true;
  next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  return false;
}

function validationError(res, parsed) {
  return res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Check the submitted message.' },
  });
}

function formatConversation(row, userId) {
  const other = row.borrower_id === userId ? row.lender : row.borrower;
  return {
    id: row.id,
    listingId: row.listing_id,
    bookingId: row.booking_id,
    title: row.listing?.title ?? 'Campus item',
    other: other ? { id: other.id, fullName: other.full_name } : null,
    createdAt: row.created_at,
  };
}

async function getConversation(conversationId, userId) {
  const { data, error } = await adminClient.from('conversations').select(conversationSelect)
    .eq('id', conversationId)
    .or(`borrower_id.eq.${userId},lender_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw fail(503, 'MESSAGE_SERVICE_UNAVAILABLE', 'The conversation could not be loaded.');
  if (!data) throw fail(404, 'CONVERSATION_NOT_FOUND', 'The conversation was not found.');
  return data;
}

export const listConversations = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const { data, error } = await adminClient.from('conversations').select(conversationSelect)
    .or(`borrower_id.eq.${req.user.id},lender_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return next(fail(503, 'MESSAGE_SERVICE_UNAVAILABLE', 'Your conversations could not be loaded.'));
  res.json({ data: { conversations: (data ?? []).map((row) => formatConversation(row, req.user.id)) } });
});

export const listConversationMessages = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  await getConversation(req.params.id, req.user.id);
  const { data, error } = await adminClient.from('messages')
    .select('id,conversation_id,sender_id,body,read_at,created_at')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return next(fail(503, 'MESSAGE_SERVICE_UNAVAILABLE', 'Messages could not be loaded.'));
  const messages = (data ?? []).reverse();
  const { error: readError } = await adminClient.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', req.params.id)
    .neq('sender_id', req.user.id)
    .is('read_at', null);
  if (readError) return next(fail(503, 'MESSAGE_SERVICE_UNAVAILABLE', 'Messages were loaded but read status could not be updated.'));
  res.json({ data: { messages } });
});

export const sendConversationMessage = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  await getConversation(req.params.id, req.user.id);
  const parsed = messageCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data: messageId, error } = await adminClient.rpc('send_conversation_message', {
    p_conversation_id: req.params.id,
    p_sender_id: req.user.id,
    p_body: parsed.data.body,
  });
  if (error) {
    if (error.code === '42501') return next(fail(403, 'CONVERSATION_ACCESS_DENIED', 'You are not part of this conversation.'));
    return next(fail(503, 'MESSAGE_SERVICE_UNAVAILABLE', 'The message could not be sent.'));
  }
  const { data: message, error: messageError } = await adminClient.from('messages')
    .select('id,conversation_id,sender_id,body,read_at,created_at')
    .eq('id', messageId)
    .single();
  if (messageError) return next(fail(503, 'MESSAGE_SERVICE_UNAVAILABLE', 'The message was sent but could not be loaded.'));
  res.status(201).json({ data: message });
});
