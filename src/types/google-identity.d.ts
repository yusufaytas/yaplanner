export {};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }

  type GoogleTokenResponse = {
    access_token: string;
    expires_in: number;
    error?: string;
    error_description?: string;
  };

  type GoogleTokenClientConfig = {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  };

  type GoogleTokenClient = {
    requestAccessToken: (overrideConfig?: {
      prompt?: '' | 'consent' | 'select_account';
      hint?: string;
    }) => void;
  };
}
