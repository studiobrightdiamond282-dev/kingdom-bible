/* Public contact details shared by the Node server and the static Vercel build. */
'use strict';
const SUPPORT_PHONE = '2348134438808';
const SUPPORT_PHONE_DISPLAY = '+234 813 443 8808';
const supportLink = (text = 'Hello KINGDOM BIBLE support') =>
  'https://wa.me/' + SUPPORT_PHONE + '?text=' + encodeURIComponent(text);
module.exports = { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, supportLink };
