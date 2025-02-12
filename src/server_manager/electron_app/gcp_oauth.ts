// Copyright 2021 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as electron from 'electron';
import * as express from 'express';
import {OAuth2Client} from 'google-auth-library';
import {AddressInfo} from 'net';

const OAUTH_CONFIG = {
  project_id: 'outline-manager-oauth',
  client_id: '946220775492-osi1dm2rhhpo4upm6qqfv9fiivv1qu6c.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/cloud-platform',
  ],
};
const REDIRECT_PATH = '/gcp/oauth/callback';

function responseHtml(messageHtml: string): string {
  return `<html><script>window.close()</script><body>${
      messageHtml}. You can close this window.</body></html>`;
}

/**
 * Verifies that the access token has the required scopes.
 *
 * The access token may have missing scopes if the user denies access to any
 * scopes in the OAuth flow.
 *
 * @param oAuthClient: The GCP OAuth 2.0 client.
 * @param accessToken: The granted access token.
 */
async function verifyGrantedScopes(
    oAuthClient: OAuth2Client, accessToken: string): Promise<boolean> {
  const getTokenInfoResponse = await oAuthClient.getTokenInfo(accessToken);
  for (const requiredScope of OAUTH_CONFIG.scopes) {
    const matchedScope =
        getTokenInfoResponse.scopes.find((grantedScope) => grantedScope === requiredScope);
    if (!matchedScope) {
      return false;
    }
  }
  return true;
}

export function runOauth(): OauthSession {
  // Start web server to handle OAuth callback
  const app = express();
  const server = app.listen();
  const port = (server.address() as AddressInfo).port;

  // Open browser to OAuth URL
  const oAuthClient = new OAuth2Client(
      OAUTH_CONFIG.client_id,
      null,
      `http://localhost:${port}${REDIRECT_PATH}`,
  );
  const oAuthUrl = oAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: OAUTH_CONFIG.scopes,
  });
  electron.shell.openExternal(oAuthUrl);

  // Handle OAuth redirect callback
  let isCancelled = false;
  const rejectWrapper = {reject: (error: Error) => {}};
  const tokenPromise = new Promise<string>((resolve, reject) => {
    rejectWrapper.reject = reject;
    app.get(REDIRECT_PATH, async (request: express.Request, response: express.Response) => {
      if (request.query.error) {
        if (request.query.error === 'access_denied') {
          isCancelled = true;
          response.send(responseHtml('Authentication cancelled'));
          reject(new Error('Authentication cancelled'));
        } else {
          response.send(responseHtml('Authentication failed'));
          reject(new Error(`Authentication failed with error: ${request.query.error}`));
        }
      } else {
        try {
          const getTokenResponse = await oAuthClient.getToken(request.query.code as string);
          if (getTokenResponse.res.status / 100 === 2) {
            const scopesValid =
                await verifyGrantedScopes(oAuthClient, getTokenResponse.tokens.access_token);
            if (!scopesValid) {
              console.error(
                  'Authentication failed with missing scope(s). Granted: ',
                  getTokenResponse.tokens.scope);
              response.send(responseHtml('Authentication failed with missing scope(s)'));
              reject(new Error('Authentication failed with missing scope(s)'));
            } else if (!getTokenResponse.tokens.refresh_token) {
              response.send(responseHtml('Authentication failed'));
              reject(new Error('Authentication failed: Missing refresh token'));
            } else {
              response.send(responseHtml('Authentication successful'));
              resolve(getTokenResponse.tokens.refresh_token);
            }
          } else {
            response.send(responseHtml('Authentication failed'));
            reject(new Error(
                `Authentication failed with HTTP status code: ${getTokenResponse.res.status}`));
          }
        } catch (error) {
          response.send(responseHtml('Authentication failed'));
          reject(new Error(`Authentication failed with error: ${request.query.error}`));
        }
      }
      server.close();
    });
  });

  return {
    result: tokenPromise,
    isCancelled() {
      return isCancelled;
    },
    cancel() {
      console.log('Session cancelled');
      isCancelled = true;
      server.close();
      rejectWrapper.reject(new Error('Authentication cancelled'));
    }
  };
}
