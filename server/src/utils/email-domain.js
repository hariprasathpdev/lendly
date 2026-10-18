import { env } from '../config/env.js';
export function isAllowedCollegeEmail(email,domains=env.allowedEmailDomains){const value=typeof email==='string'?email.trim().toLowerCase():'';const at=value.lastIndexOf('@');if(at<1||at===value.length-1)return false;const domain=value.slice(at+1);return domains.some((allowed)=>domain===allowed.toLowerCase());}
