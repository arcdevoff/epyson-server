import { google } from 'googleapis';
import googleServiceAccountKeys from './service_google_account.js';

const googleapi = new google.auth.JWT(
  googleServiceAccountKeys.client_email,
  null,
  googleServiceAccountKeys.private_key,
  ['https://www.googleapis.com/auth/indexing'],
  null,
);

export default googleapi;
