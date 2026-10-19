import { adminClient } from '../config/supabase.js';

// Security event logging is deliberately best effort: a logging outage must not
// change the authentication or payment result, and only fixed event codes are sent.
export async function recordSecurityEvent(actorId, eventType, source) {
  if (!adminClient || !actorId) return;
  try {
    const { error } = await adminClient.rpc('record_security_event', {
      p_actor_id: actorId,
      p_event_type: eventType,
      p_source: source,
    });
    if (error) console.warn({ event: 'security_event_record_failed', eventType });
  } catch {
    console.warn({ event: 'security_event_record_failed', eventType });
  }
}
