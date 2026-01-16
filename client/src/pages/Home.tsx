import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Film,
  FolderOpen,
  ImagePlus,
  Loader2,
  LogOut,
  Search,
  Settings,
  Trash2,
  Upload,
  XCircle,
  Eye,
  EyeOff,
  Play,
  AlignLeft,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// Google API constants
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

// Load Google API scripts
let googleApiLoaded = false;
let googlePickerLoaded = false;

const loadGoogleApi = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (googleApiLoaded) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      googleApiLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

const loadGoogleIdentity = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

const loadGooglePicker = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (googlePickerLoaded) {
      resolve();
      return;
    }
    (window as any).gapi.load('picker', {
      callback: () => {
        googlePickerLoaded = true;
        resolve();
      },
      onerror: reject,
    });
  });
};

// Types
interface MediaFile {
  id: string;
  file?: File; // Optional for Google Drive files
  preview?: string; // Optional for Google Drive files
  name: string;
  aspectRatio: string;
  base64: string;
  type: "image" | "video";
  cdnUrl?: string; // Bunny.net CDN URL (backup)
  bunnyPath?: string; // Path on Bunny storage for deletion
  thumbnail?: string; // Video thumbnail (first frame)
  metaHash?: string; // Image hash from Meta API
  metaVideoId?: string; // Video ID from Meta API
  uploadStatus?: "pending" | "uploading" | "success" | "error"; // Upload status
  uploadProgress?: number; // Upload progress 0-100
  uploadError?: string; // Error message if upload failed
  // Google Drive fields
  googleDriveFileId?: string; // Google Drive file ID for server-side upload
  googleDriveMimeType?: string; // MIME type from Google Drive
  googleDriveThumbnail?: string; // Thumbnail URL from Google Drive
  isGoogleDrive?: boolean; // Flag to indicate this is a Google Drive file
}

interface AdData {
  id: string;
  adName: string;
  hook: string;
  primaryText: string;
  media: MediaFile[];
  status: "idle" | "creating" | "success" | "error";
  errorMessage?: string;
  adId?: string;
}

interface AdSetData {
  id: string;
  name: string;
  ads: AdData[];
  sharedBody: string;
  sharedHeadline: string;
  sharedUrl: string;
  status: "idle" | "creating" | "success" | "error";
  createdAdSetId?: string;
  isExpanded: boolean;
  mediaType: "image" | "video" | "mixed";
  scheduleEnabled: boolean;
  scheduleDate: string;
  scheduleTime: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
}

interface Ad {
  id: string;
  name: string;
  status: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    image_url?: string;
  };
}

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
}

// Facebook mobile text width (approximately 320px for primary text area)
const FB_TEXT_WIDTH = "320px";

// Helper to get tomorrow's date in YYYY-MM-DD format
const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
};

// Helper to arrange text: one sentence per line with blank lines between
const arrangeText = (text: string): string => {
  // Split by sentence endings (. ! ?) followed by space or end
  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n\n')
    .split('\n\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences.join('\n\n');
};

// Helper to combine hook and body with proper spacing
const combineHookAndBody = (hook: string, body: string): string => {
  const trimmedHook = hook.trim();
  const trimmedBody = body.trim();
  
  if (!trimmedHook && !trimmedBody) return '';
  if (!trimmedHook) return trimmedBody;
  if (!trimmedBody) return trimmedHook;
  
  // Always add a blank line between hook and body
  return `${trimmedHook}\n\n${trimmedBody}`;
};

// Extract thumbnail from video (first frame at 1 second) and return dimensions
interface VideoThumbnailResult {
  thumbnail: string;
  width: number;
  height: number;
}

const extractVideoThumbnail = (videoFile: File): Promise<VideoThumbnailResult> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    video.onloadedmetadata = () => {
      // Seek to 1 second or 10% of duration, whichever is smaller
      video.currentTime = Math.min(1, video.duration * 0.1);
    };
    
    video.onseeked = () => {
      // Get actual video dimensions
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      console.log(`[Video] Dimensions: ${videoWidth}x${videoHeight}`);
      
      // Set canvas size to video dimensions (max 320px width for thumbnail)
      const scale = Math.min(1, 320 / videoWidth);
      canvas.width = videoWidth * scale;
      canvas.height = videoHeight * scale;
      
      // Draw the frame
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      
      // Cleanup
      URL.revokeObjectURL(video.src);
      resolve({ thumbnail, width: videoWidth, height: videoHeight });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to extract video thumbnail'));
    };
    
    // Load video from file
    video.src = URL.createObjectURL(videoFile);
  });
};

export default function Home() {
  // Auth state
  const { data: user, isLoading: authLoading } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  // LocalStorage keys
  const LS_KEYS = {
    FB_TOKEN: 'meta_ads_fb_token',
    FB_CONNECTED: 'meta_ads_fb_connected',
    SELECTED_AD_ACCOUNT: 'meta_ads_selected_account',
    ENABLED_AD_ACCOUNTS: 'meta_ads_enabled_accounts',
    SELECTED_CAMPAIGN: 'meta_ads_selected_campaign',
    SELECTED_ADSET: 'meta_ads_selected_adset',
    SELECTED_AD: 'meta_ads_selected_ad',
    NUM_ADSETS: 'meta_ads_num_adsets',
    ADS_PER_ADSET: 'meta_ads_ads_per_adset',
    SHOW_INACTIVE_CAMPAIGNS: 'meta_ads_show_inactive_campaigns',
    SHOW_INACTIVE_ADSETS: 'meta_ads_show_inactive_adsets',
    SHOW_INACTIVE_ADS: 'meta_ads_show_inactive_ads',
    MEDIA_POOL: 'meta_ads_media_pool',
    CAMPAIGN_SEARCH: 'meta_ads_campaign_search',
    ADSET_SEARCH: 'meta_ads_adset_search',
    AD_SEARCH: 'meta_ads_ad_search',
    ADSETS_PREVIEW: 'meta_ads_adsets_preview',
    SHOW_PREVIEW: 'meta_ads_show_preview',
    AD_NAME_COMPOSER: 'meta_ads_ad_name_composer',
    GOOGLE_DRIVE_LAST_FOLDER: 'meta_ads_google_drive_last_folder',
  };

  // Helper to get from localStorage
  const getLS = <T,>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  // Helper to set to localStorage
  const setLS = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  };

  // Facebook state - initialize from localStorage
  const [fbConnected, setFbConnected] = useState(() => getLS(LS_KEYS.FB_CONNECTED, false));
  const [fbAccessToken, setFbAccessToken] = useState<string | null>(() => getLS(LS_KEYS.FB_TOKEN, null));

  // Google Drive state
  const [gdriveConnected, setGdriveConnected] = useState(false);

  // Ad Account state - initialize from localStorage
  const [allAdAccounts, setAllAdAccounts] = useState<AdAccount[]>([]);
  const [enabledAdAccounts, setEnabledAdAccounts] = useState<string[]>(() => getLS(LS_KEYS.ENABLED_AD_ACCOUNTS, []));
  const [selectedAdAccount, setSelectedAdAccount] = useState(() => getLS(LS_KEYS.SELECTED_AD_ACCOUNT, ""));
  const [showAdAccountModal, setShowAdAccountModal] = useState(false);
  const [isFirstConnect, setIsFirstConnect] = useState(false);

  // Selection state - initialize from localStorage
  const [selectedCampaign, setSelectedCampaign] = useState(() => getLS(LS_KEYS.SELECTED_CAMPAIGN, ""));
  const [selectedAdSet, setSelectedAdSet] = useState(() => getLS(LS_KEYS.SELECTED_ADSET, ""));
  const [selectedAd, setSelectedAd] = useState(() => getLS(LS_KEYS.SELECTED_AD, ""));

  // Search filters - initialize from localStorage
  const [campaignSearch, setCampaignSearch] = useState(() => getLS(LS_KEYS.CAMPAIGN_SEARCH, ""));
  const [adSetSearch, setAdSetSearch] = useState(() => getLS(LS_KEYS.ADSET_SEARCH, ""));
  const [adSearch, setAdSearch] = useState(() => getLS(LS_KEYS.AD_SEARCH, ""));

  // Show inactive toggles - initialize from localStorage
  const [showInactiveCampaigns, setShowInactiveCampaigns] = useState(() => getLS(LS_KEYS.SHOW_INACTIVE_CAMPAIGNS, false));
  const [showInactiveAdSets, setShowInactiveAdSets] = useState(() => getLS(LS_KEYS.SHOW_INACTIVE_ADSETS, false));
  const [showInactiveAds, setShowInactiveAds] = useState(() => getLS(LS_KEYS.SHOW_INACTIVE_ADS, false));

  // Media pool (Step 2) - initialize from localStorage (CDN URLs)
  const [mediaPool, setMediaPool] = useState<MediaFile[]>(() => {
    try {
      const saved = localStorage.getItem(LS_KEYS.MEDIA_POOL);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore from CDN URLs
        return parsed.map((m: { id: string; name: string; aspectRatio: string; type: string; cdnUrl?: string; bunnyPath?: string }) => ({
          id: m.id,
          name: m.name,
          aspectRatio: m.aspectRatio,
          type: m.type as "image" | "video",
          cdnUrl: m.cdnUrl,
          bunnyPath: m.bunnyPath,
          preview: m.cdnUrl || '', // Use CDN URL as preview
          base64: '', // No base64 needed when we have CDN URL
          file: null as unknown as File, // File object can't be serialized
        }));
      }
    } catch (e) {
      console.error('Failed to load media from localStorage:', e);
    }
    return [];
  });

  // Distribution settings (Step 3) - initialize from localStorage
  const [numAdSets, setNumAdSets] = useState(() => getLS(LS_KEYS.NUM_ADSETS, 1));
  const [adsPerAdSet, setAdsPerAdSet] = useState(() => getLS(LS_KEYS.ADS_PER_ADSET, 5));
  const [showPreview, setShowPreview] = useState(() => getLS(LS_KEYS.SHOW_PREVIEW, false));
  const [adNameComposer, setAdNameComposer] = useState(() => getLS(LS_KEYS.AD_NAME_COMPOSER, '$IMAGE-NAME'));

  // Ad Sets for preview (Step 4) - initialize from localStorage
  const [adSetsPreview, setAdSetsPreview] = useState<AdSetData[]>(() => getLS(LS_KEYS.ADSETS_PREVIEW, []));

  // Global schedule settings - pre-filled with tomorrow 00:05
  const [globalScheduleEnabled, setGlobalScheduleEnabled] = useState(false);
  const [globalScheduleDate, setGlobalScheduleDate] = useState(getTomorrowDate());
  const [globalScheduleTime, setGlobalScheduleTime] = useState("00:05");

  // Creating state
  const [isCreating, setIsCreating] = useState(false);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [showProgressDialog, setShowProgressDialog] = useState(false);

  // Refs for scroll to selected item
  const campaignRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const adSetRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const adRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Query for saved Facebook token
  const savedTokenQuery = trpc.meta.getSavedToken.useQuery(undefined, {
    enabled: !!user && !fbConnected,
  });

  // Query for saved ad account settings
  const adAccountSettingsQuery = trpc.meta.getAdAccountSettings.useQuery(undefined, {
    enabled: !!user,
  });

  // Mutation to save Facebook token
  const saveTokenMutation = trpc.meta.saveFacebookToken.useMutation();

  // Mutation to save ad account settings
  const saveAdAccountSettingsMutation = trpc.meta.saveAdAccountSettings.useMutation();

  // Mutations for direct Meta upload
  const uploadImageToMetaMutation = (trpc.meta as any).uploadImageToMeta?.useMutation() || { mutateAsync: async () => { throw new Error('Not available'); } };
  const uploadVideoToMetaMutation = (trpc.meta as any).uploadVideoToMeta?.useMutation() || { mutateAsync: async () => { throw new Error('Not available'); } };
  const uploadFromGoogleDriveMutation = (trpc.meta as any).uploadFromGoogleDriveToMeta?.useMutation() || { mutateAsync: async () => { throw new Error('Not available'); } };

  // Google token management
  const googleTokenQuery = (trpc as any).google?.getToken?.useQuery(undefined, {
    enabled: !!user,
  });
  const saveGoogleTokenMutation = (trpc as any).google?.saveToken?.useMutation();
  const clearGoogleTokenMutation = (trpc as any).google?.clearToken?.useMutation();

  // State for upload progress
  const [isUploadingToMeta, setIsUploadingToMeta] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; completed: number; failed: number }>({ total: 0, completed: 0, failed: 0 });

  // Auto-connect if we have a saved token (from DB or localStorage)
  useEffect(() => {
    // First try from database
    if (savedTokenQuery.data && !fbConnected) {
      setFbAccessToken(savedTokenQuery.data.accessToken);
      setFbConnected(true);
      toast.success("Facebook auto-connected!");
    } 
    // If no DB token but we have localStorage token, use that
    else if (!savedTokenQuery.data && !fbConnected && fbAccessToken) {
      setFbConnected(true);
      toast.success("Facebook connected from cache!");
    }
  }, [savedTokenQuery.data, fbConnected, fbAccessToken]);

  // Load ad account settings from database
  useEffect(() => {
    if (adAccountSettingsQuery.data) {
      if (adAccountSettingsQuery.data.enabledAdAccountIds.length > 0) {
        setEnabledAdAccounts(adAccountSettingsQuery.data.enabledAdAccountIds);
      }
      if (adAccountSettingsQuery.data.selectedAdAccountId) {
        setSelectedAdAccount(adAccountSettingsQuery.data.selectedAdAccountId);
      }
    }
  }, [adAccountSettingsQuery.data]);

  // Check for FB token in URL (OAuth callback)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      const expiresIn = params.get("expires_in");
      if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const expiry = expiresIn ? parseInt(expiresIn) : 5184000;
        
        // Save token and get long-lived version back
        saveTokenMutation.mutate(
          { accessToken: token, expiresIn: expiry },
          {
            onSuccess: (data: any) => {
              // Use the long-lived token returned from server
              const longLivedToken = data.accessToken || token;
              const longLivedExpiry = data.expiresIn || expiry;
              
              setFbAccessToken(longLivedToken);
              setFbConnected(true);
              
              const daysUntilExpiry = Math.round(longLivedExpiry / 86400);
              toast.success(`Facebook connected! Token valid for ${daysUntilExpiry} days`);
              console.log("[FB Token] Long-lived token received, expires in", daysUntilExpiry, "days");
            },
            onError: (error) => {
              // Fallback to short-lived token if exchange fails
              setFbAccessToken(token);
              setFbConnected(true);
              toast.success("Facebook connected!");
              console.error("[FB Token] Exchange failed, using short-lived token:", error);
            }
          }
        );
      }
    }
  }, []);

  // API queries
  const adAccountsQuery = trpc.meta.getAdAccounts.useQuery(
    { accessToken: fbAccessToken || "" },
    { enabled: !!fbAccessToken && fbConnected }
  );

  // When ad accounts load
  useEffect(() => {
    console.log('[AdAccounts] Query status:', {
      isLoading: adAccountsQuery.isLoading,
      isError: adAccountsQuery.isError,
      error: adAccountsQuery.error?.message,
      dataLength: adAccountsQuery.data?.length,
      fbConnected,
      fbAccessToken: fbAccessToken ? 'present' : 'missing',
    });
    
    if (adAccountsQuery.data && adAccountsQuery.data.length > 0) {
      console.log('[AdAccounts] Loaded', adAccountsQuery.data.length, 'accounts');
      setAllAdAccounts(adAccountsQuery.data as AdAccount[]);
      // Only show modal if no saved settings
      if (!adAccountSettingsQuery.data?.enabledAdAccountIds?.length) {
        setIsFirstConnect(true);
        setShowAdAccountModal(true);
      }
    } else if (adAccountsQuery.isError) {
      console.error('[AdAccounts] Error loading:', adAccountsQuery.error);
      toast.error('Failed to load Ad Accounts: ' + (adAccountsQuery.error?.message || 'Unknown error'));
    }
  }, [adAccountsQuery.data, adAccountsQuery.isLoading, adAccountsQuery.isError, adAccountSettingsQuery.data, fbConnected, fbAccessToken]);

  // Save to localStorage when values change
  useEffect(() => { setLS(LS_KEYS.FB_TOKEN, fbAccessToken); }, [fbAccessToken]);
  useEffect(() => { setLS(LS_KEYS.FB_CONNECTED, fbConnected); }, [fbConnected]);
  useEffect(() => { setLS(LS_KEYS.SELECTED_AD_ACCOUNT, selectedAdAccount); }, [selectedAdAccount]);
  useEffect(() => { setLS(LS_KEYS.ENABLED_AD_ACCOUNTS, enabledAdAccounts); }, [enabledAdAccounts]);
  useEffect(() => { setLS(LS_KEYS.SELECTED_CAMPAIGN, selectedCampaign); }, [selectedCampaign]);
  useEffect(() => { setLS(LS_KEYS.SELECTED_ADSET, selectedAdSet); }, [selectedAdSet]);
  useEffect(() => { setLS(LS_KEYS.SELECTED_AD, selectedAd); }, [selectedAd]);
  useEffect(() => { setLS(LS_KEYS.NUM_ADSETS, numAdSets); }, [numAdSets]);
  useEffect(() => { setLS(LS_KEYS.ADS_PER_ADSET, adsPerAdSet); }, [adsPerAdSet]);
  useEffect(() => { setLS(LS_KEYS.AD_NAME_COMPOSER, adNameComposer); }, [adNameComposer]);
  useEffect(() => { setLS(LS_KEYS.SHOW_INACTIVE_CAMPAIGNS, showInactiveCampaigns); }, [showInactiveCampaigns]);
  useEffect(() => { setLS(LS_KEYS.SHOW_INACTIVE_ADSETS, showInactiveAdSets); }, [showInactiveAdSets]);
  useEffect(() => { setLS(LS_KEYS.SHOW_INACTIVE_ADS, showInactiveAds); }, [showInactiveAds]);


  useEffect(() => { setLS(LS_KEYS.CAMPAIGN_SEARCH, campaignSearch); }, [campaignSearch]);
  useEffect(() => { setLS(LS_KEYS.ADSET_SEARCH, adSetSearch); }, [adSetSearch]);
  useEffect(() => { setLS(LS_KEYS.AD_SEARCH, adSearch); }, [adSearch]);
  useEffect(() => { setLS(LS_KEYS.SHOW_PREVIEW, showPreview); }, [showPreview]);
  useEffect(() => { setLS(LS_KEYS.ADSETS_PREVIEW, adSetsPreview); }, [adSetsPreview]);
  
  // Save media pool to localStorage (only save CDN URLs, not base64)
  useEffect(() => {
    try {
      // Only save CDN URLs and metadata - no base64 data
      const toSave = mediaPool.map(m => ({
        id: m.id,
        name: m.name,
        aspectRatio: m.aspectRatio,
        type: m.type,
        cdnUrl: m.cdnUrl,
        bunnyPath: m.bunnyPath,
      }));
      localStorage.setItem(LS_KEYS.MEDIA_POOL, JSON.stringify(toSave));
      console.log(`[localStorage] Saved ${toSave.length} media items`);
    } catch (e) {
      console.error('Failed to save media to localStorage:', e);
    }
  }, [mediaPool]);

  const saveEnabledAccounts = (accounts: string[], selected?: string) => {
    setEnabledAdAccounts(accounts);
    const selectedId = selected || (accounts.length > 0 ? accounts[0] : null);
    if (selectedId) {
      setSelectedAdAccount(selectedId);
    }
    // Save to database
    saveAdAccountSettingsMutation.mutate({
      selectedAdAccountId: selectedId,
      enabledAdAccountIds: accounts,
    });
  };

  const toggleAdAccount = (accountId: string) => {
    setEnabledAdAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const enabledAdAccountsList = allAdAccounts.filter((acc) => enabledAdAccounts.includes(acc.id));
  const selectedAccountName = enabledAdAccountsList.find((acc) => acc.id === selectedAdAccount)?.name || "";

  const campaignsQuery = trpc.meta.getCampaigns.useQuery(
    { accessToken: fbAccessToken || "", adAccountId: selectedAdAccount, showInactive: showInactiveCampaigns },
    { enabled: !!fbAccessToken && fbConnected && !!selectedAdAccount }
  );

  const adSetsQuery = trpc.meta.getAdSets.useQuery(
    { accessToken: fbAccessToken || "", campaignId: selectedCampaign, showInactive: showInactiveAdSets },
    { enabled: !!fbAccessToken && !!selectedCampaign }
  );

  const adsQuery = trpc.meta.getAds.useQuery(
    { accessToken: fbAccessToken || "", adSetId: selectedAdSet, showInactive: showInactiveAds },
    { enabled: !!fbAccessToken && !!selectedAdSet }
  );

  const adDetailsQuery = trpc.meta.getAdDetails.useQuery(
    { accessToken: fbAccessToken || "", adId: selectedAd },
    { enabled: !!fbAccessToken && !!selectedAd }
  );

  // Mutations
  const batchCreateAdsMutation = trpc.meta.batchCreateAds.useMutation();

  // Facebook Login
  const handleFacebookLogin = () => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const scope = "ads_management,ads_read,business_management";
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=token`;
    window.location.href = authUrl;
  };

  // Google Drive state for picker
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isLoadingGoogleDrive, setIsLoadingGoogleDrive] = useState(false);

  // Google Drive Connect - opens picker
  // Exchange Google auth code mutation
  const exchangeGoogleCodeMutation = (trpc as any).google?.exchangeCode?.useMutation();

  const handleGoogleDriveConnect = async () => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
      toast.error("Google API credentials not configured");
      return;
    }

    setIsLoadingGoogleDrive(true);
    try {
      // Load Google APIs
      await loadGoogleApi();
      await loadGoogleIdentity();
      await loadGooglePicker();

      // Check if we have a saved token from DB
      const savedToken = googleTokenQuery?.data;
      if (savedToken?.accessToken) {
        console.log("[Google Drive] Using saved token from DB");
        setGoogleAccessToken(savedToken.accessToken);
        openGooglePicker(savedToken.accessToken);
        return;
      }

      // Check if we have token in state
      if (googleAccessToken) {
        console.log("[Google Drive] Using token from state");
        openGooglePicker(googleAccessToken);
        return;
      }

      // Use Authorization Code flow to get refresh token (for 60-day persistence)
      const google = (window as any).google;
      const codeClient = google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        ux_mode: 'popup',
        callback: async (response: any) => {
          if (response.code) {
            console.log("[Google Drive] Got authorization code, exchanging for tokens...");
            try {
              // Exchange code for tokens on server (gets refresh token)
              const result = await exchangeGoogleCodeMutation?.mutateAsync({
                code: response.code,
                redirectUri: window.location.origin,
              });
              
              if (result?.accessToken) {
                console.log("[Google Drive] Got tokens! Has refresh token:", result.hasRefreshToken);
                setGoogleAccessToken(result.accessToken);
                
                // Refetch the token query to update cache
                googleTokenQuery?.refetch();
                
                openGooglePicker(result.accessToken);
              } else {
                toast.error("Failed to get access token");
                setIsLoadingGoogleDrive(false);
              }
            } catch (err: any) {
              console.error("[Google Drive] Token exchange failed:", err);
              toast.error(err.message || "Failed to authenticate with Google");
              setIsLoadingGoogleDrive(false);
            }
          } else if (response.error) {
            console.error("[Google Drive] Auth error:", response.error);
            toast.error("Google authentication failed");
            setIsLoadingGoogleDrive(false);
          }
        },
      });

      // Request authorization code (will open popup)
      codeClient.requestCode();
    } catch (error) {
      console.error("Google Drive error:", error);
      toast.error("Failed to connect to Google Drive");
      setIsLoadingGoogleDrive(false);
    }
  };

  // Open Google Picker
  const openGooglePicker = (accessToken: string) => {
    const google = (window as any).google;
    
    // Get last folder from localStorage
    const lastFolderId = localStorage.getItem(LS_KEYS.GOOGLE_DRIVE_LAST_FOLDER);
    
    // Create view for regular Drive with folder navigation (List view)
    const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(google.picker.DocsViewMode.LIST) // List view by default
      .setMimeTypes('image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm');
    
    // If we have a last folder, set it as the parent
    if (lastFolderId) {
      docsView.setParent(lastFolderId);
    }
    
    // Create view for Shared Drives (List view)
    const sharedDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setEnableDrives(true)
      .setMode(google.picker.DocsViewMode.LIST) // List view by default
      .setMimeTypes('image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm');
    
    // Build picker with Shared Drives as the first/default view
    const picker = new google.picker.PickerBuilder()
      .addView(sharedDriveView) // Shared Drives first (default tab)
      .addView(docsView) // My Drive second
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setCallback((data: any) => handlePickerCallback(data, accessToken))
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .setTitle('Select Images or Videos')
      .build();
    
    picker.setVisible(true);
    setIsLoadingGoogleDrive(false);
  };

  // Handle picker selection - saves only file IDs, no download
  const handlePickerCallback = async (data: any, accessToken: string) => {
    const google = (window as any).google;
    
    if (data.action === google.picker.Action.PICKED) {
      const files = data.docs;
      
      // Save the parent folder ID for next time
      if (files.length > 0 && files[0].parentId) {
        localStorage.setItem(LS_KEYS.GOOGLE_DRIVE_LAST_FOLDER, files[0].parentId);
        console.log('[Google Drive] Saved last folder:', files[0].parentId);
      }
      
      // Save Google access token for server-side upload
      if (accessToken) {
        localStorage.setItem('google_access_token_temp', accessToken);
      }
      
      // Create MediaFile entries without downloading - just save IDs
      const newMedia: MediaFile[] = [];
      
      // Helper function to get real thumbnail from Google Drive API
      const getRealThumbnail = async (fileId: string): Promise<string> => {
        try {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,hasThumbnail`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.thumbnailLink) {
              // Replace size parameter to get larger thumbnail
              return data.thumbnailLink.replace('=s220', '=s400');
            }
          }
        } catch (error) {
          console.error('Failed to get thumbnail for', fileId, error);
        }
        return '';
      };
      
      for (const file of files) {
        const isVideo = file.mimeType?.startsWith('video/');
        const isImage = file.mimeType?.startsWith('image/');
        
        if (!isVideo && !isImage) {
          console.log(`Skipping non-media file: ${file.name}`);
          continue;
        }
        
        // Get real thumbnail and video dimensions from Google Drive API
        let thumbnailUrl = '';
        let aspectRatio = "1x1";
        
        // Always try to get metadata from Google Drive API for thumbnail and dimensions
        try {
          const metadataResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?fields=videoMediaMetadata,imageMediaMetadata,thumbnailLink,hasThumbnail`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            console.log(`[Google Drive] Metadata for ${file.name}:`, JSON.stringify(metadata));
            
            // Get thumbnail - use larger size
            if (metadata.thumbnailLink) {
              thumbnailUrl = metadata.thumbnailLink.replace('=s220', '=s400');
              console.log(`[Google Drive] Thumbnail URL for ${file.name}:`, thumbnailUrl);
            }
            
            // Get dimensions for video
            if (isVideo && metadata.videoMediaMetadata) {
              const { width, height } = metadata.videoMediaMetadata;
              if (width && height) {
                const ratio = width / height;
                console.log(`[Google Drive] Video dimensions: ${width}x${height}, ratio: ${ratio}`);
                if (ratio < 0.65) aspectRatio = "9x16";
                else if (ratio < 0.9) aspectRatio = "4x5";
                else if (ratio < 1.1) aspectRatio = "1x1";
                else aspectRatio = "16x9";
              }
            }
            
            // Get dimensions for image
            if (!isVideo && metadata.imageMediaMetadata) {
              const { width, height } = metadata.imageMediaMetadata;
              if (width && height) {
                const ratio = width / height;
                console.log(`[Google Drive] Image dimensions: ${width}x${height}, ratio: ${ratio}`);
                if (ratio < 0.65) aspectRatio = "9x16";
                else if (ratio < 0.9) aspectRatio = "4x5";
                else if (ratio < 1.1) aspectRatio = "1x1";
                else aspectRatio = "16x9";
              }
            }
          }
        } catch (err) {
          console.error(`[Google Drive] Failed to get metadata for ${file.name}:`, err);
        }
        
        // Fallback: try to detect from filename if no dimensions from API
        if (aspectRatio === "1x1") {
          const name = file.name.toLowerCase();
          // Check for common aspect ratio patterns in filename
          if (name.includes("9x16") || name.includes("9_16") || name.includes("916") || name.includes("vertical") || name.includes("story") || name.includes("stories") || name.includes("reel")) {
            aspectRatio = "9x16";
          } else if (name.includes("4x5") || name.includes("4_5") || name.includes("45") || name.includes("feed")) {
            aspectRatio = "4x5";
          } else if (name.includes("16x9") || name.includes("16_9") || name.includes("169") || name.includes("horizontal") || name.includes("landscape")) {
            aspectRatio = "16x9";
          } else if (name.includes("1x1") || name.includes("1_1") || name.includes("square")) {
            aspectRatio = "1x1";
          }
          // If still 1x1 and it's a video, default to 9x16 (most common for ads)
          if (aspectRatio === "1x1" && isVideo) {
            console.log(`[Google Drive] No aspect ratio detected for video ${file.name}, defaulting to 9x16`);
            aspectRatio = "9x16";
          }
        }
        
        // If we still don't have thumbnail, try other methods
        if (!thumbnailUrl) {
          console.log(`[Google Drive] No thumbnail from metadata for ${file.name}, trying fallback...`);
          if (file.thumbnails && file.thumbnails.length > 0) {
            thumbnailUrl = file.thumbnails[file.thumbnails.length - 1].url;
            console.log(`[Google Drive] Using picker thumbnail for ${file.name}:`, thumbnailUrl);
          } else {
            thumbnailUrl = await getRealThumbnail(file.id);
            console.log(`[Google Drive] Fallback thumbnail for ${file.name}:`, thumbnailUrl || 'not available');
          }
        }
        
        console.log(`[Google Drive] Final aspect ratio for ${file.name}: ${aspectRatio}`);
        
        const mediaFile: MediaFile = {
          id: `gdrive_${file.id}_${Date.now()}`,
          name: file.name,
          base64: '', // No base64 for Google Drive files
          aspectRatio,
          type: isVideo ? 'video' : 'image',
          thumbnail: thumbnailUrl,
          uploadStatus: 'pending',
          // Google Drive specific fields
          isGoogleDrive: true,
          googleDriveFileId: file.id,
          googleDriveMimeType: file.mimeType,
          googleDriveThumbnail: thumbnailUrl,
        };
        
        newMedia.push(mediaFile);
      }
      
      if (newMedia.length > 0) {
        setMediaPool(prev => {
          const updated = [...prev, ...newMedia];
          // Save to localStorage (without base64 for Google Drive files)
          const toSave = updated.map(m => ({
            ...m,
            base64: m.isGoogleDrive ? '' : m.base64 // Don't save base64 for Google Drive files
          }));
          localStorage.setItem(LS_KEYS.MEDIA_POOL, JSON.stringify(toSave));
          return updated;
        });
        toast.success(`Added ${newMedia.length} file(s) from Google Drive. Click "UPLOAD TO META" to upload.`);
      }
    } else if (data.action === google.picker.Action.CANCEL) {
      // User cancelled
    }
  };

  // Compress image to reduce size
  const compressImage = async (file: File, maxWidth = 1200, quality = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Upload to Bunny mutation
  const uploadToBunnyMutation = trpc.meta.uploadToBunny.useMutation();

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList) => {
    const newMedia: MediaFile[] = [];
    toast.info(`Processing ${files.length} file(s)...`);

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (!isVideo && !isImage) continue;

      const preview = URL.createObjectURL(file);
      
      let base64: string;
      if (isImage) {
        // Compress images to avoid 413 error
        base64 = await compressImage(file, 1200, 0.85);
      } else {
        // For videos, keep original (but warn if too large)
        if (file.size > 50 * 1024 * 1024) {
          toast.warning(`Video ${file.name} is large (${(file.size / 1024 / 1024).toFixed(1)}MB). Upload may take a while.`);
        }
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      // Detect aspect ratio from actual image dimensions
      let aspectRatio = "1x1";
      if (isImage) {
        aspectRatio = await new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const ratio = img.width / img.height;
            let detected = "1x1";
            // 9x16 = 0.5625, 4x5 = 0.8, 1x1 = 1.0, 16x9 = 1.778
            if (ratio < 0.65) {
              detected = "9x16"; // Portrait tall (9:16)
            } else if (ratio < 0.9) {
              detected = "4x5"; // Portrait (4:5)
            } else if (ratio < 1.1) {
              detected = "1x1"; // Square (1:1)
            } else {
              detected = "16x9"; // Landscape (16:9)
            }
            console.log(`[Aspect Ratio] File: ${file.name} -> ${img.width}x${img.height} = ${ratio.toFixed(2)} -> ${detected}`);
            URL.revokeObjectURL(img.src);
            resolve(detected);
          };
          img.onerror = () => resolve("1x1");
          img.src = URL.createObjectURL(file);
        });
      }

      // Extract thumbnail for videos and detect aspect ratio from actual dimensions
      let thumbnail: string | undefined;
      if (isVideo) {
        try {
          const result = await extractVideoThumbnail(file);
          thumbnail = result.thumbnail;
          
          // Detect aspect ratio from actual video dimensions
          const { width, height } = result;
          if (width > 0 && height > 0) {
            const ratio = width / height;
            console.log(`[Video] ${file.name}: ${width}x${height}, ratio=${ratio.toFixed(3)}`);
            // 9x16 = 0.5625, 4x5 = 0.8, 1x1 = 1.0, 16x9 = 1.778
            if (ratio < 0.65) {
              aspectRatio = "9x16"; // Portrait tall (9:16)
            } else if (ratio < 0.9) {
              aspectRatio = "4x5"; // Portrait (4:5)
            } else if (ratio < 1.1) {
              aspectRatio = "1x1"; // Square
            } else {
              aspectRatio = "16x9"; // Landscape
            }
            console.log(`[Video] ${file.name}: Detected aspect ratio: ${aspectRatio}`);
          } else {
            // Fallback to filename detection
            const name = file.name.toLowerCase();
            if (name.includes("16x9") || name.includes("16_9")) aspectRatio = "16x9";
            else if (name.includes("1x1") || name.includes("1_1")) aspectRatio = "1x1";
            else if (name.includes("4x5") || name.includes("4_5")) aspectRatio = "4x5";
            else aspectRatio = "9x16"; // Default for videos
          }
        } catch (err) {
          console.error(`[Thumbnail] Failed for ${file.name}:`, err);
          // Fallback to filename detection
          const name = file.name.toLowerCase();
          if (name.includes("16x9") || name.includes("16_9")) aspectRatio = "16x9";
          else if (name.includes("1x1") || name.includes("1_1")) aspectRatio = "1x1";
          else if (name.includes("4x5") || name.includes("4_5")) aspectRatio = "4x5";
          else aspectRatio = "9x16"; // Default for videos
        }
      }

      // NO Bunny upload - files stay local until "UPLOAD TO META" is clicked
      // Bunny functions are kept as backup in bunnyStorage.ts

      newMedia.push({
        id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview, // Local preview URL
        name: file.name,
        aspectRatio,
        base64,
        type: isVideo ? "video" : "image",
        thumbnail, // Video thumbnail
        uploadStatus: 'pending', // Ready to upload to Meta
      });
    }

    setMediaPool((prev) => [...prev, ...newMedia]);
    toast.success(`${newMedia.length} file(s) added. Click "UPLOAD TO META" to upload.`);
  }, []);

  // Group media by prefix
  const groupMediaByPrefix = (media: MediaFile[]): Map<string, MediaFile[]> => {
    const groups = new Map<string, MediaFile[]>();
    
    // First, sort media alphabetically by name (handles HOOK1, HOOK2, etc.)
    const sortedMedia = [...media].sort((a, b) => {
      // Natural sort to handle numbers correctly (HOOK1 < HOOK2 < HOOK10)
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    for (const m of sortedMedia) {
      const prefix = m.name
        .replace(/\.(jpg|jpeg|png|gif|mp4|mov|webm)$/i, "")
        .replace(/[_-]?(9x16|4x5|1x1|16x9|9_16|4_5|1_1|16_9)$/i, "")
        .toLowerCase();
      
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix)!.push(m);
    }
    
    // Sort the groups alphabetically by prefix
    const sortedGroups = new Map(
      Array.from(groups.entries()).sort((a, b) => 
        a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
      )
    );
    
    return sortedGroups;
  };

  // Upload all media to Meta API (get hashes/video IDs)
  const handleUploadToMeta = async () => {
    if (mediaPool.length === 0) {
      toast.error("No media to upload");
      return;
    }

    if (!fbAccessToken || !selectedAdAccount) {
      toast.error("Please connect Facebook and select an ad account first");
      return;
    }

    setIsUploadingToMeta(true);
    setUploadProgress({ total: mediaPool.length, completed: 0, failed: 0 });

    const updatedMedia: MediaFile[] = [...mediaPool];
    let completed = 0;
    let failed = 0;

    // Get Google access token from localStorage (saved during picker callback)
    const googleAccessToken = localStorage.getItem('google_access_token_temp') || '';

    for (let i = 0; i < updatedMedia.length; i++) {
      const media = updatedMedia[i];
      
      // Skip if already uploaded
      if (media.metaHash || media.metaVideoId) {
        completed++;
        setUploadProgress(prev => ({ ...prev, completed }));
        continue;
      }

      // Update status to uploading
      updatedMedia[i] = { ...media, uploadStatus: 'uploading', uploadProgress: 0 };
      setMediaPool([...updatedMedia]);

      try {
        // Check if this is a Google Drive file (server-to-server upload)
        if (media.isGoogleDrive && media.googleDriveFileId) {
          console.log(`[Upload] Google Drive file: ${media.name} - using server-to-server`);
          
          if (!googleAccessToken) {
            throw new Error('Google access token not found. Please re-import from Google Drive.');
          }
          
          const result = await uploadFromGoogleDriveMutation.mutateAsync({
            accessToken: fbAccessToken,
            adAccountId: selectedAdAccount,
            googleAccessToken: googleAccessToken,
            fileId: media.googleDriveFileId,
            fileName: media.name,
            mimeType: media.googleDriveMimeType || (media.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          });
          
          if (result.type === 'video') {
            updatedMedia[i] = {
              ...media,
              metaVideoId: result.videoId,
              uploadStatus: 'success',
              uploadProgress: 100,
            };
          } else {
            updatedMedia[i] = {
              ...media,
              metaHash: result.hash,
              uploadStatus: 'success',
              uploadProgress: 100,
            };
          }
          completed++;
        } else if (media.type === 'image') {
          // Local file - Upload image to Meta via base64
          console.log(`[Upload] Local image: ${media.name}`);
          const result = await uploadImageToMetaMutation.mutateAsync({
            accessToken: fbAccessToken,
            adAccountId: selectedAdAccount,
            imageBase64: media.base64,
            fileName: media.name,
          });
          
          updatedMedia[i] = {
            ...media,
            metaHash: result.hash,
            uploadStatus: 'success',
            uploadProgress: 100,
          };
          completed++;
        } else {
          // Local file - Upload video to Meta via base64
          console.log(`[Upload] Local video: ${media.name}`);
          
          // Check if we have base64 data
          if (!media.base64) {
            throw new Error(`No base64 data for video ${media.name}. Please re-add the video.`);
          }
          
          const result = await uploadVideoToMetaMutation.mutateAsync({
            accessToken: fbAccessToken,
            adAccountId: selectedAdAccount,
            base64Data: media.base64, // Fixed: was videoBase64, should be base64Data
            fileName: media.name,
          });
          
          updatedMedia[i] = {
            ...media,
            metaVideoId: result.videoId,
            thumbnail: result.thumbnailUrl || media.thumbnail,
            uploadStatus: 'success',
            uploadProgress: 100,
          };
          completed++;
        }
      } catch (error: any) {
        console.error(`[Upload] Failed for ${media.name}:`, error);
        updatedMedia[i] = {
          ...media,
          uploadStatus: 'error',
          uploadError: error.message || 'Upload failed',
        };
        failed++;
      }

      setUploadProgress({ total: mediaPool.length, completed, failed });
      setMediaPool([...updatedMedia]);
    }

    setIsUploadingToMeta(false);

    if (failed === 0) {
      toast.success(`All ${completed} files uploaded to Meta!`);
    } else {
      toast.warning(`${completed} uploaded, ${failed} failed. Click "Retry Failed" to try again.`);
    }
  };

  // Retry failed uploads
  const handleRetryFailed = async () => {
    const failedMedia = mediaPool.filter(m => m.uploadStatus === 'error');
    if (failedMedia.length === 0) {
      toast.info("No failed uploads to retry");
      return;
    }

    // Reset failed items to pending
    setMediaPool(prev => prev.map(m => 
      m.uploadStatus === 'error' 
        ? { ...m, uploadStatus: 'pending', uploadError: undefined }
        : m
    ));

    // Re-run upload
    await handleUploadToMeta();
  };

  // Check if all media is uploaded
  const allMediaUploaded = useMemo(() => {
    return mediaPool.length > 0 && mediaPool.every(m => m.metaHash || m.metaVideoId);
  }, [mediaPool]);

  // Count failed uploads
  const failedUploadsCount = useMemo(() => {
    return mediaPool.filter(m => m.uploadStatus === 'error').length;
  }, [mediaPool]);

  // Distribute media into ad sets
  const handleDistribute = () => {
    if (mediaPool.length === 0) {
      toast.error("Upload some media first");
      return;
    }

    const groups = groupMediaByPrefix(mediaPool);
    const groupsArray = Array.from(groups.entries());
    
    const hasImages = mediaPool.some(m => m.type === "image");
    const hasVideos = mediaPool.some(m => m.type === "video");
    const mediaType: "image" | "video" | "mixed" = hasImages && hasVideos ? "mixed" : hasVideos ? "video" : "image";

    const newAdSets: AdSetData[] = [];
    let groupIndex = 0;

    // Helper to clean adset name (remove aspect ratio suffixes)
    const cleanAdsetName = (name: string): string => {
      return name
        .replace(/[_-]?(4x5|9x16|16x9|1x1|4_5|9_16|16_9|1_1)$/i, '')
        .trim();
    };

    // Helper to compose ad name based on template and media type
    const composeAdName = (imageName: string, hookIndex: number, isVideo: boolean): string => {
      if (isVideo) {
        // For video: exact filename without extension, no hook
        return imageName.replace(/\.[^/.]+$/, '').toUpperCase();
      } else {
        // For image: use composer template with hook
        const cleanImageName = imageName.replace(/\.[^/.]+$/, '').toUpperCase();
        const baseName = adNameComposer.replace('$IMAGE-NAME', cleanImageName);
        return `${baseName}_HOOK${hookIndex + 1}`;
      }
    };

    for (let i = 0; i < numAdSets; i++) {
      const ads: AdData[] = [];
      
      for (let j = 0; j < adsPerAdSet && groupIndex < groupsArray.length; j++) {
        const [prefix, media] = groupsArray[groupIndex];
        const isVideoGroup = media.some(m => m.type === 'video');
        const firstMediaName = media[0]?.name || prefix;
        
        ads.push({
          id: `ad-${Date.now()}-${groupIndex}`,
          adName: composeAdName(firstMediaName, j, isVideoGroup),
          hook: "",
          primaryText: "",
          media,
          status: "idle",
        });
        groupIndex++;
      }

      if (ads.length > 0) {
        // Use first media name as adset name (without extension and aspect ratio)
        const firstMediaName = ads[0]?.media[0]?.name || `Ad Set ${i + 1}`;
        const rawAdsetName = firstMediaName.replace(/\.[^/.]+$/, "").toUpperCase();
        const adsetName = cleanAdsetName(rawAdsetName);
        
        newAdSets.push({
          id: `adset-${Date.now()}-${i}`,
          name: adsetName,
          ads,
          sharedBody: "",
          sharedHeadline: "",
          sharedUrl: adDetailsQuery.data?.url || "",
          status: "idle",
          isExpanded: true,
          mediaType,
          scheduleEnabled: false,
          scheduleDate: getTomorrowDate(),
          scheduleTime: "00:05",
        });
      }
    }

    setAdSetsPreview(newAdSets);
    setShowPreview(true);
    toast.success(`Distributed into ${newAdSets.length} Ad Set(s)`);
  };

  // Update ad set
  const updateAdSet = (adSetId: string, field: keyof AdSetData, value: string | boolean) => {
    setAdSetsPreview((prev) =>
      prev.map((as) => (as.id === adSetId ? { ...as, [field]: value } : as))
    );
  };

  // Update ad in ad set
  const updateAd = (adSetId: string, adId: string, field: keyof AdData, value: string) => {
    setAdSetsPreview((prev) =>
      prev.map((as) =>
        as.id === adSetId
          ? { ...as, ads: as.ads.map((ad) => (ad.id === adId ? { ...ad, [field]: field === "adName" ? value.toUpperCase() : value } : ad)) }
          : as
      )
    );
  };

  // Remove ad from ad set
  const removeAd = (adSetId: string, adId: string) => {
    setAdSetsPreview((prev) =>
      prev.map((as) =>
        as.id === adSetId ? { ...as, ads: as.ads.filter((ad) => ad.id !== adId) } : as
      )
    );
  };

  // Remove ad set
  const removeAdSet = (adSetId: string) => {
    setAdSetsPreview((prev) => prev.filter((as) => as.id !== adSetId));
  };

  // Arrange text for a specific ad set's body
  const handleArrangeText = (adSetId: string) => {
    setAdSetsPreview((prev) =>
      prev.map((as) =>
        as.id === adSetId ? { ...as, sharedBody: arrangeText(as.sharedBody) } : as
      )
    );
    toast.success("Text arranged!");
  };

  // Apply global schedule to all ad sets
  const applyGlobalSchedule = () => {
    if (!globalScheduleDate || !globalScheduleTime) {
      toast.error("Please set date and time first");
      return;
    }
    setAdSetsPreview((prev) =>
      prev.map((as) => ({
        ...as,
        scheduleEnabled: true,
        scheduleDate: globalScheduleDate,
        scheduleTime: globalScheduleTime,
      }))
    );
    toast.success("Schedule applied to all Ad Sets");
  };

  // Helper to add progress log
  const addProgressLog = (message: string) => {
    setProgressLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Rate limiting helper - wait between API calls
  const rateLimitDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Create all ads
  const handleCreateAll = async () => {
    if (!selectedAd || !selectedAdSet || !fbAccessToken) {
      toast.error("Please select a template ad first");
      return;
    }

    const adSetsWithAds = adSetsPreview.filter((as) => as.ads.length > 0);
    if (adSetsWithAds.length === 0) {
      toast.error("No ads to create");
      return;
    }

    // Reset and show progress
    setProgressLogs([]);
    setProgressPercent(0);
    setShowProgressDialog(true);
    setIsCreating(true);
    
    const totalAds = adSetsWithAds.reduce((sum, as) => sum + as.ads.length, 0);
    let completedAds = 0;
    
    addProgressLog(`Starting creation of ${adSetsWithAds.length} Ad Set(s) with ${totalAds} total ads...`);

    for (let adSetIndex = 0; adSetIndex < adSetsWithAds.length; adSetIndex++) {
      const adSet = adSetsWithAds[adSetIndex];
      setAdSetsPreview((prev) =>
        prev.map((as) => (as.id === adSet.id ? { ...as, status: "creating" } : as))
      );

      try {
        addProgressLog(`[Ad Set ${adSetIndex + 1}/${adSetsWithAds.length}] Creating "${adSet.name}"...`);
        
        let scheduledTime: number | undefined;
        if (adSet.scheduleEnabled && adSet.scheduleDate && adSet.scheduleTime) {
          const bucharestDate = new Date(`${adSet.scheduleDate}T${adSet.scheduleTime}:00`);
          scheduledTime = Math.floor(bucharestDate.getTime() / 1000);
          addProgressLog(`  → Scheduled for ${adSet.scheduleDate} ${adSet.scheduleTime}`);
        }

        addProgressLog(`  → Preparing ${adSet.ads.length} ad(s)...`);
        
        // Prepare ads with media - need to handle both base64 and CDN URLs
        const adsToCreate = await Promise.all(adSet.ads.map(async (ad) => {
          let primaryText = "";
          if (adSet.mediaType === "image" || adSet.mediaType === "mixed") {
            primaryText = combineHookAndBody(ad.hook, adSet.sharedBody);
          } else {
            primaryText = ad.primaryText;
          }

          // Process media - fetch from CDN if needed
          console.log(`[Media Processing] Ad: ${ad.adName}, Media count: ${ad.media.length}`);
          const processedMedia = await Promise.all(ad.media.map(async (m) => {
            let base64Data = "";
            
            console.log(`[Media Processing] Processing: ${m.name}`);
            console.log(`[Media Processing]   - base64 length: ${m.base64?.length || 0}`);
            console.log(`[Media Processing]   - cdnUrl: ${m.cdnUrl || 'none'}`);
            
            // If we have base64 data, use it
            if (m.base64 && m.base64.length > 100) {
              base64Data = m.base64.split(",")[1] || m.base64;
              console.log(`[Media Processing]   - Using existing base64 (length: ${base64Data.length})`);
            } 
            // If we have CDN URL, fetch and convert to base64
            else if (m.cdnUrl) {
              try {
                console.log(`[Media Processing]   - Fetching from CDN: ${m.cdnUrl}`);
                const response = await fetch(m.cdnUrl);
                console.log(`[Media Processing]   - Fetch response status: ${response.status}`);
                const blob = await response.blob();
                console.log(`[Media Processing]   - Blob size: ${blob.size}`);
                const reader = new FileReader();
                base64Data = await new Promise<string>((resolve) => {
                  reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.split(",")[1] || result);
                  };
                  reader.readAsDataURL(blob);
                });
                console.log(`[Media Processing]   - Converted to base64 (length: ${base64Data.length})`);
              } catch (e) {
                console.error("Failed to fetch media from CDN:", e);
              }
            } else {
              console.error(`[Media Processing]   - ERROR: No base64 and no CDN URL!`);
            }
            
            return {
              filename: m.name,
              base64: base64Data,
              type: m.type,
              aspectRatio: m.aspectRatio,
              metaHash: m.metaHash, // Pre-uploaded image hash
              metaVideoId: m.metaVideoId, // Pre-uploaded video ID
            };
          }));

          return {
            adName: ad.adName,
            primaryText,
            headline: adSet.sharedHeadline,
            url: adSet.sharedUrl,
            media: processedMedia,
          };
        }));

        addProgressLog(`  → Uploading media and creating ads via Meta API...`);
        
        const result = await batchCreateAdsMutation.mutateAsync({
          accessToken: fbAccessToken,
          templateAdId: selectedAd,
          newAdSetName: adSet.name,
          ads: adsToCreate,
          scheduledTime: scheduledTime ? new Date(scheduledTime * 1000).toISOString() : undefined,
        });

        const updatedAds = adSet.ads.map((ad, idx) => {
          const adResult = result.results[idx];
          completedAds++;
          setProgressPercent(Math.round((completedAds / totalAds) * 100));
          
          if (adResult?.success) {
            addProgressLog(`  ✓ Ad "${ad.adName}" created successfully (ID: ${adResult.adId})`);
          } else {
            addProgressLog(`  ✗ Ad "${ad.adName}" failed: ${adResult?.error || "Unknown error"}`);
          }
          
          return {
            ...ad,
            status: adResult?.success ? ("success" as const) : ("error" as const),
            adId: adResult?.adId,
            errorMessage: adResult?.error,
          };
        });

        const allSuccess = updatedAds.every((ad) => ad.status === "success");
        
        if (allSuccess) {
          addProgressLog(`  ✓ Ad Set "${adSet.name}" completed successfully!`);
        } else {
          addProgressLog(`  ⚠ Ad Set "${adSet.name}" completed with some errors`);
        }

        setAdSetsPreview((prev) =>
          prev.map((as) =>
            as.id === adSet.id
              ? { ...as, status: allSuccess ? "success" : "error", createdAdSetId: result.adSetId, ads: updatedAds }
              : as
          )
        );

        toast.success(`Ad Set "${adSet.name}" created!`);
        
        // Rate limiting: wait 2 seconds between Ad Sets to avoid hitting Meta API limits
        if (adSetIndex < adSetsWithAds.length - 1) {
          addProgressLog(`  ⏳ Waiting 2s before next Ad Set (rate limiting)...`);
          await rateLimitDelay(2000);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        addProgressLog(`  ✗ ERROR: ${errorMessage}`);
        
        setAdSetsPreview((prev) =>
          prev.map((as) =>
            as.id === adSet.id
              ? { ...as, status: "error", ads: as.ads.map((ad) => ({ ...ad, status: "error", errorMessage })) }
              : as
          )
        );
        toast.error(`Failed: ${errorMessage}`);
        
        // Rate limiting even on error
        if (adSetIndex < adSetsWithAds.length - 1) {
          addProgressLog(`  ⏳ Waiting 2s before next Ad Set...`);
          await rateLimitDelay(2000);
        }
      }
    }

    addProgressLog(`\n=== COMPLETED ===`);
    addProgressLog(`Total: ${completedAds}/${totalAds} ads created`);
    setProgressPercent(100);
    setIsCreating(false);
  };

  // Create single ad set
  const handleCreateSingleAdSet = async (adSetId: string) => {
    const adSet = adSetsPreview.find((as) => as.id === adSetId);
    if (!adSet || !selectedAd || !fbAccessToken) return;

    setAdSetsPreview((prev) =>
      prev.map((as) => (as.id === adSetId ? { ...as, status: "creating" } : as))
    );

    try {
      let scheduledTime: number | undefined;
      if (adSet.scheduleEnabled && adSet.scheduleDate && adSet.scheduleTime) {
        const bucharestDate = new Date(`${adSet.scheduleDate}T${adSet.scheduleTime}:00`);
        scheduledTime = Math.floor(bucharestDate.getTime() / 1000);
      }

      const adsToCreate = adSet.ads.map((ad) => {
        let primaryText = "";
        if (adSet.mediaType === "image" || adSet.mediaType === "mixed") {
          primaryText = combineHookAndBody(ad.hook, adSet.sharedBody);
        } else {
          primaryText = ad.primaryText;
        }

        return {
          adName: ad.adName,
          primaryText,
          headline: adSet.sharedHeadline,
          url: adSet.sharedUrl,
          media: ad.media.map((m) => ({
            filename: m.name,
            base64: m.base64 ? (m.base64.split(",")[1] || m.base64) : "",
            type: m.type,
            aspectRatio: m.aspectRatio,
            metaHash: m.metaHash, // Pre-uploaded image hash
            metaVideoId: m.metaVideoId, // Pre-uploaded video ID
          })),
        };
      });

      const result = await batchCreateAdsMutation.mutateAsync({
        accessToken: fbAccessToken,
        templateAdId: selectedAd,
        newAdSetName: adSet.name,
        ads: adsToCreate,
        scheduledTime: scheduledTime ? new Date(scheduledTime * 1000).toISOString() : undefined,
      });

      const updatedAds = adSet.ads.map((ad, idx) => {
        const adResult = result.results[idx];
        return {
          ...ad,
          status: adResult?.success ? ("success" as const) : ("error" as const),
          adId: adResult?.adId,
          errorMessage: adResult?.error,
        };
      });

      const allSuccess = updatedAds.every((ad) => ad.status === "success");

      setAdSetsPreview((prev) =>
        prev.map((as) =>
          as.id === adSetId
            ? { ...as, status: allSuccess ? "success" : "error", createdAdSetId: result.adSetId, ads: updatedAds }
            : as
        )
      );

      toast.success(`Ad Set "${adSet.name}" created!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setAdSetsPreview((prev) =>
        prev.map((as) =>
          as.id === adSetId
            ? { ...as, status: "error", ads: as.ads.map((ad) => ({ ...ad, status: "error", errorMessage })) }
            : as
        )
      );
      toast.error(`Failed: ${errorMessage}`);
    }
  };

  // Filter and sort campaigns, ad sets, ads by search (alphabetically A-Z)
  const campaigns = useMemo(() => {
    const data = (campaignsQuery.data || []) as Campaign[];
    const filtered = campaignSearch 
      ? data.filter(c => c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
      : data;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [campaignsQuery.data, campaignSearch]);

  const adSets = useMemo(() => {
    const data = (adSetsQuery.data || []) as AdSet[];
    const filtered = adSetSearch
      ? data.filter(a => a.name.toLowerCase().includes(adSetSearch.toLowerCase()))
      : data;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [adSetsQuery.data, adSetSearch]);

  const ads = useMemo(() => {
    const data = (adsQuery.data || []) as Ad[];
    const filtered = adSearch
      ? data.filter(a => a.name.toLowerCase().includes(adSearch.toLowerCase()))
      : data;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [adsQuery.data, adSearch]);

  const totalAdsInPreview = adSetsPreview.reduce((sum, as) => sum + as.ads.length, 0);

  // Scroll to selected items after data loads
  useEffect(() => {
    if (selectedCampaign && campaignRefs.current[selectedCampaign]) {
      setTimeout(() => {
        campaignRefs.current[selectedCampaign]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [selectedCampaign, campaigns]);

  useEffect(() => {
    if (selectedAdSet && adSetRefs.current[selectedAdSet]) {
      setTimeout(() => {
        adSetRefs.current[selectedAdSet]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [selectedAdSet, adSets]);

  useEffect(() => {
    if (selectedAd && adRefs.current[selectedAd]) {
      setTimeout(() => {
        adRefs.current[selectedAd]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [selectedAd, ads]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    window.location.href = "/login";
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="app-container flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Upload className="h-3.5 w-3.5 text-white" />
            </div>
            <h1 className="text-base font-semibold">Meta Ads Uploader</h1>
          </div>
          <div className="flex items-center gap-2">
            {fbConnected ? (
              <>
                {selectedAdAccount && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-green-700">{selectedAccountName || selectedAdAccount}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 text-green-600 hover:text-green-800 hover:bg-green-100"
                      onClick={() => setShowAdAccountModal(true)}
                    >
                      <Settings className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                )}
                {!selectedAdAccount && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAdAccountModal(true)}>
                    Select Ad Account
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-red-600 hover:text-red-800 hover:bg-red-50"
                  onClick={() => {
                    // Disconnect Facebook
                    setFbConnected(false);
                    setFbAccessToken(null);
                    setAllAdAccounts([]);
                    setEnabledAdAccounts([]);
                    setSelectedAdAccount('');
                    localStorage.removeItem(LS_KEYS.FB_TOKEN);
                    localStorage.removeItem(LS_KEYS.FB_CONNECTED);
                    localStorage.removeItem(LS_KEYS.SELECTED_AD_ACCOUNT);
                    localStorage.removeItem(LS_KEYS.ENABLED_AD_ACCOUNTS);
                    toast.success('Facebook disconnected');
                  }}
                >
                  Disconnect
                </Button>
                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">
                  <CheckCircle2 className="h-3 w-3" />
                  FB
                </span>
              </>
            ) : (
              <Button onClick={handleFacebookLogin} variant="outline" size="sm" className="h-7 text-xs">
                Connect Facebook
              </Button>
            )}
            <div className="flex items-center gap-1.5 border-l pl-2">
              <span className="text-xs text-muted-foreground">{user?.name || "User"}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => logoutMutation.mutate()}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-container py-2 space-y-2">
        {/* Step 1: Select Template Ad */}
        <Card>
          <CardHeader className="py-1 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                1
              </span>
              Select Template Ad
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2">
            {!fbConnected || !selectedAdAccount ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {!fbConnected ? "Connect Facebook to see your campaigns" : "Select an Ad Account from the header"}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 h-[280px]">
                {/* Column 1: Campaigns */}
                <div className="border rounded-lg flex flex-col overflow-hidden">
                  <div className="p-1.5 border-b bg-muted/50 flex items-center justify-between gap-1">
                    <span className="text-xs font-medium">Campaigns</span>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={showInactiveCampaigns}
                        onCheckedChange={(checked) => setShowInactiveCampaigns(!!checked)}
                        className="h-3 w-3"
                      />
                      {showInactiveCampaigns ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                    </label>
                  </div>
                  <div className="px-1.5 py-1 border-b">
                    <div className="relative">
                      <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={campaignSearch}
                        onChange={(e) => setCampaignSearch(e.target.value)}
                        className="h-6 text-xs pl-6 pr-2"
                      />
                    </div>
                  </div>
                  <ScrollArea className="flex-1 overflow-auto">
                    <div className="p-1">
                      {campaignsQuery.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                      ) : campaigns.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No campaigns</p>
                      ) : (
                        campaigns.map((c) => (
                          <button
                            key={c.id}
                            ref={(el) => { campaignRefs.current[c.id] = el; }}
                            onClick={() => {
                              setSelectedCampaign(c.id);
                              setSelectedAdSet("");
                              setSelectedAd("");
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition-colors truncate ${
                              selectedCampaign === c.id 
                                ? "bg-primary text-primary-foreground" 
                                : c.status === "PAUSED" 
                                  ? "text-red-600 hover:bg-red-50" 
                                  : "hover:bg-muted"
                            }`}
                          >
                            {c.name}
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Column 2: Ad Sets */}
                <div className="border rounded-lg flex flex-col overflow-hidden">
                  <div className="p-1.5 border-b bg-muted/50 flex items-center justify-between gap-1">
                    <span className="text-xs font-medium">Ad Sets</span>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={showInactiveAdSets}
                        onCheckedChange={(checked) => setShowInactiveAdSets(!!checked)}
                        className="h-3 w-3"
                      />
                      {showInactiveAdSets ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                    </label>
                  </div>
                  <div className="px-1.5 py-1 border-b">
                    <div className="relative">
                      <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={adSetSearch}
                        onChange={(e) => setAdSetSearch(e.target.value)}
                        className="h-6 text-xs pl-6 pr-2"
                      />
                    </div>
                  </div>
                  <ScrollArea className="flex-1 overflow-auto">
                    <div className="p-1">
                      {!selectedCampaign ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Select a campaign</p>
                      ) : adSetsQuery.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                      ) : adSets.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No ad sets</p>
                      ) : (
                        adSets.map((a) => (
                          <button
                            key={a.id}
                            ref={(el) => { adSetRefs.current[a.id] = el; }}
                            onClick={() => {
                              setSelectedAdSet(a.id);
                              setSelectedAd("");
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition-colors truncate ${
                              selectedAdSet === a.id 
                                ? "bg-primary text-primary-foreground" 
                                : a.status === "PAUSED" 
                                  ? "text-red-600 hover:bg-red-50" 
                                  : "hover:bg-muted"
                            }`}
                          >
                            {a.name}
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Column 3: Ads */}
                <div className="border rounded-lg flex flex-col overflow-hidden">
                  <div className="p-1.5 border-b bg-muted/50 flex items-center justify-between gap-1">
                    <span className="text-xs font-medium">Ads</span>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={showInactiveAds}
                        onCheckedChange={(checked) => setShowInactiveAds(!!checked)}
                        className="h-3 w-3"
                      />
                      {showInactiveAds ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                    </label>
                  </div>
                  <div className="px-1.5 py-1 border-b">
                    <div className="relative">
                      <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={adSearch}
                        onChange={(e) => setAdSearch(e.target.value)}
                        className="h-6 text-xs pl-6 pr-2"
                      />
                    </div>
                  </div>
                  <ScrollArea className="flex-1 overflow-auto">
                    <div className="p-1">
                      {!selectedAdSet ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Select an ad set</p>
                      ) : adsQuery.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                      ) : ads.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No ads</p>
                      ) : (
                        ads.map((a) => (
                          <button
                            key={a.id}
                            ref={(el) => { adRefs.current[a.id] = el; }}
                            onClick={() => setSelectedAd(a.id)}
                            className={`w-full text-left px-1.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                              selectedAd === a.id 
                                ? "bg-primary text-primary-foreground" 
                                : a.status === "PAUSED" 
                                  ? "text-red-600 hover:bg-red-50" 
                                  : "hover:bg-muted"
                            }`}
                          >
                            <div className="w-6 h-6 rounded overflow-hidden bg-muted flex-shrink-0">
                              {a.creative?.thumbnail_url || a.creative?.image_url ? (
                                <img src={a.creative.thumbnail_url || a.creative.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImagePlus className="h-3 w-3 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <span className="truncate flex-1">{a.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Upload Media */}
        <Card>
          <CardHeader className="py-1 px-3">
            <CardTitle className="text-sm flex items-center gap-2 justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                  2
                </span>
                Upload Media (Images / Videos)
                {mediaPool.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">({mediaPool.length} files)</span>
                )}
              </div>
              {mediaPool.length > 0 && (
                <button
                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Remove all files from media pool?')) {
                      setMediaPool([]);
                      localStorage.removeItem(LS_KEYS.MEDIA_POOL);
                      toast.success('All files removed');
                    }
                  }}
                >
                  Remove All
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2">
            {/* Google Drive Import Button - Above Upload Zone */}
            <button
              className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                handleGoogleDriveConnect();
              }}
              disabled={isLoadingGoogleDrive}
            >
              {isLoadingGoogleDrive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066da"/>
                  <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-27z" fill="#00ac47"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" fill="#ea4335"/>
                  <path d="M43.65 25l13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832d"/>
                  <path d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.45 4.5-1.2L59.85 53z" fill="#2684fc"/>
                  <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5l-12.7-22z" fill="#ffba00"/>
                </svg>
              )}
              <span>Import from Google Drive</span>
            </button>

            {/* Upload Zone - Full Width */}
            <div
              className="relative border-2 border-dashed rounded-lg p-4 min-h-[150px] transition-colors hover:border-primary/50 cursor-pointer"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-primary", "bg-primary/5");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-primary", "bg-primary/5");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                if (e.dataTransfer.files.length > 0) {
                  handleFileUpload(e.dataTransfer.files);
                }
              }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.accept = "image/*,video/*";
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files) handleFileUpload(files);
                };
                input.click();
              }}
            >
              
              {mediaPool.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <div className="flex gap-2 mb-2">
                    <ImagePlus className="h-8 w-8" />
                    <Film className="h-8 w-8" />
                  </div>
                  <p className="font-medium text-sm">Drop images & videos here</p>
                  <p className="text-xs mt-1">or click to browse</p>
                </div>
              ) : (
                  <div className="space-y-2">
                    {/* Grouped media display with upload status */}
                    {(() => {
                      const groups = groupMediaByPrefix(mediaPool);
                      return Array.from(groups.entries()).map(([prefix, media]) => (
                        <div key={prefix} className="border rounded-lg p-2 bg-muted/30">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-medium truncate flex-1">{prefix.toUpperCase()}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {media.map(m => m.aspectRatio).join(" + ")}
                            </span>
                            {/* Upload status indicator */}
                            {media.every(m => m.metaHash || m.metaVideoId) && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            )}
                            {media.some(m => m.uploadStatus === 'error') && (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            )}
                            {media.some(m => m.uploadStatus === 'uploading') && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const idsToRemove = media.map(m => m.id);
                                setMediaPool((prev) => prev.filter((p) => !idsToRemove.includes(p.id)));
                              }}
                              className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <div className="flex gap-1">
                            {media.map((m) => (
                              <div key={m.id} className="relative group w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                                {m.type === "image" ? (
                                  <img src={m.preview || m.thumbnail || m.googleDriveThumbnail || ''} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-800 relative">
                                    {(m.thumbnail || m.googleDriveThumbnail) ? (
                                      <img src={m.thumbnail || m.googleDriveThumbnail || ''} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Play className="h-3 w-3 text-white" />
                                    )}
                                    <Play className="absolute h-3 w-3 text-white drop-shadow-lg" />
                                  </div>
                                )}
                                {/* Upload status overlay */}
                                {m.uploadStatus === 'uploading' && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                                  </div>
                                )}
                                {m.uploadStatus === 'success' && (
                                  <div className="absolute top-0.5 right-0.5">
                                    <CheckCircle2 className="h-3 w-3 text-green-500 drop-shadow" />
                                  </div>
                                )}
                                {m.uploadStatus === 'error' && (
                                  <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[6px] px-0.5 text-center truncate" title={m.name}>
                                  {m.name.replace(/\.[^/.]+$/, "").slice(-10)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
            </div>

            {/* Upload to Meta section */}
            {mediaPool.length > 0 && (
              <div className="mt-3 space-y-2">
                {/* Progress bar */}
                {isUploadingToMeta && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Uploading to Meta...</span>
                      <span>{uploadProgress.completed + uploadProgress.failed}/{uploadProgress.total}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                        style={{ width: `${((uploadProgress.completed + uploadProgress.failed) / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                    {uploadProgress.failed > 0 && (
                      <p className="text-xs text-red-500">{uploadProgress.failed} failed</p>
                    )}
                  </div>
                )}

                {/* Upload button and status */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUploadToMeta();
                    }}
                    disabled={isUploadingToMeta || !fbConnected || !selectedAdAccount || allMediaUploaded}
                    className="flex-1 h-10 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {isUploadingToMeta ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...</>
                    ) : allMediaUploaded ? (
                      <><CheckCircle2 className="h-4 w-4 mr-2" /> All Uploaded to Meta</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> UPLOAD TO META</>
                    )}
                  </Button>

                  {/* Retry Failed button */}
                  {failedUploadsCount > 0 && !isUploadingToMeta && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetryFailed();
                      }}
                      variant="outline"
                      className="h-10 text-sm border-red-300 text-red-600 hover:bg-red-50"
                    >
                      Retry Failed ({failedUploadsCount})
                    </Button>
                  )}
                </div>

                {/* Status message */}
                {!fbConnected && (
                  <p className="text-xs text-amber-600">Connect Facebook first to upload</p>
                )}
                {fbConnected && !selectedAdAccount && (
                  <p className="text-xs text-amber-600">Select an Ad Account first</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Establish Nr of Adsets - Only show after upload */}
        {allMediaUploaded && (
        <Card>
          <CardHeader className="py-1 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                3
              </span>
              Establish Nr of Adsets
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Ad Sets:</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={numAdSets}
                  onChange={(e) => setNumAdSets(parseInt(e.target.value) || 1)}
                  className="w-16 h-7 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Ads per Set:</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={adsPerAdSet}
                  onChange={(e) => setAdsPerAdSet(parseInt(e.target.value) || 1)}
                  className="w-16 h-7 text-xs"
                />
              </div>
              <Button onClick={handleDistribute} disabled={mediaPool.length === 0} size="sm" className="h-7">
                Distribute
              </Button>
            </div>
            {/* Ad Name Composer - only for images */}
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
              <Label className="text-xs whitespace-nowrap">Ad Name Composer (images only):</Label>
              <Input
                value={adNameComposer}
                onChange={(e) => setAdNameComposer(e.target.value.toUpperCase())}
                placeholder="$IMAGE-NAME"
                className="h-7 text-xs font-mono flex-1 max-w-[300px]"
              />
              <span className="text-[10px] text-muted-foreground">Use $IMAGE-NAME as placeholder. Hook will be appended automatically.</span>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Step 4: Preview (only shown after Distribute) */}
        {showPreview && adSetsPreview.length > 0 && (
          <Card>
            <CardHeader className="py-1 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    4
                  </span>
                  Preview
                  <span className="text-xs font-normal text-muted-foreground">
                    ({adSetsPreview.length} Ad Sets, {totalAdsInPreview} Ads)
                  </span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-2 space-y-2">
              {adSetsPreview.map((adSet, index) => (
                <Card
                  key={adSet.id}
                  className={`${
                    adSet.status === "success"
                      ? "border-green-300 bg-green-50/50"
                      : adSet.status === "error"
                      ? "border-red-300 bg-red-50/50"
                      : ""
                  }`}
                >
                  <CardHeader className="py-1 px-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => updateAdSet(adSet.id, "isExpanded", !adSet.isExpanded)}
                        >
                          {adSet.isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                        <span className="text-xs text-muted-foreground font-medium">Adset {index + 1}:</span>
                        <Input
                          value={adSet.name}
                          onChange={(e) => updateAdSet(adSet.id, "name", e.target.value)}
                          className="h-6 text-xs font-medium max-w-[200px]"
                          placeholder="Ad Set Name"
                        />
                        <span className="text-xs text-muted-foreground">({adSet.ads.length} ads)</span>
                        {adSet.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {adSet.status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
                        {adSet.status === "creating" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Per Ad Set Schedule */}
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            checked={adSet.scheduleEnabled}
                            onCheckedChange={(checked) => updateAdSet(adSet.id, "scheduleEnabled", !!checked)}
                            className="h-3 w-3"
                          />
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {adSet.scheduleEnabled && (
                            <>
                              <Input
                                type="date"
                                value={adSet.scheduleDate}
                                onChange={(e) => updateAdSet(adSet.id, "scheduleDate", e.target.value)}
                                className="h-5 w-28 text-[10px]"
                              />
                              <Input
                                type="time"
                                value={adSet.scheduleTime}
                                onChange={(e) => updateAdSet(adSet.id, "scheduleTime", e.target.value)}
                                className="h-5 w-20 text-[10px]"
                              />
                            </>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleCreateSingleAdSet(adSet.id)}
                          disabled={isCreating || adSet.status === "success" || !selectedAd}
                        >
                          {adSet.status === "creating" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Create"
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-700"
                          onClick={() => removeAdSet(adSet.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {adSet.isExpanded && (
                    <CardContent className="pt-0 px-2 pb-2">
                      <div className="space-y-2">
                        {/* Ads list */}
                        {adSet.ads.map((ad, adIndex) => (
                          <div
                            key={ad.id}
                            className={`border rounded p-2 ${
                              ad.status === "success"
                                ? "border-green-200 bg-green-50"
                                : ad.status === "error"
                                ? "border-red-200 bg-red-50"
                                : ""
                            }`}
                          >
                            <div className="flex gap-3">
                              {/* Media preview */}
                              <div className="flex-shrink-0">
                                {ad.media.length > 0 && (
                                  <div className="space-y-1">
                                    {ad.media.slice(0, 1).map((m) => (
                                      <div
                                        key={m.id}
                                        className="rounded overflow-hidden bg-muted"
                                        style={{
                                          width: m.type === "video" ? "200px" : "120px",
                                          height: m.type === "video" ? "112px" : "120px",
                                        }}
                                      >
                                        {m.type === "image" ? (
                                          <img src={m.preview || m.thumbnail || m.googleDriveThumbnail || ''} alt="" className="w-full h-full object-cover" />
                                        ) : m.isGoogleDrive ? (
                                          // For Google Drive videos, show thumbnail since we don't have the video file locally
                                          <div className="w-full h-full bg-slate-800 relative flex items-center justify-center">
                                            {(m.thumbnail || m.googleDriveThumbnail) ? (
                                              <img src={m.thumbnail || m.googleDriveThumbnail || ''} alt="" className="w-full h-full object-cover" />
                                            ) : null}
                                            <Play className="absolute h-8 w-8 text-white drop-shadow-lg" />
                                          </div>
                                        ) : (
                                          <video
                                            src={m.preview}
                                            className="w-full h-full object-cover"
                                            controls
                                            muted
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Ad fields */}
                              <div className="flex-1 space-y-1.5" style={{ maxWidth: FB_TEXT_WIDTH }}>
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={ad.adName}
                                    onChange={(e) => updateAd(adSet.id, ad.id, "adName", e.target.value)}
                                    className="h-6 text-xs font-medium flex-1 uppercase"
                                    placeholder="AD NAME"
                                  />
                                  {ad.status === "success" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                  {ad.status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => removeAd(adSet.id, ad.id)}
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </Button>
                                </div>

                                {/* For images: Hook field */}
                                {adSet.mediaType !== "video" && (
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Hook {adIndex + 1}</Label>
                                    <Textarea
                                      value={ad.hook}
                                      onChange={(e) => updateAd(adSet.id, ad.id, "hook", e.target.value)}
                                      className="text-xs resize-y"
                                      style={{ minHeight: "55px", width: "100%" }}
                                      placeholder="Hook text..."
                                    />
                                  </div>
                                )}

                                {/* For videos: Primary Text field */}
                                {adSet.mediaType === "video" && (
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Primary Text</Label>
                                    <Textarea
                                      value={ad.primaryText}
                                      onChange={(e) => updateAd(adSet.id, ad.id, "primaryText", e.target.value)}
                                      className="text-xs resize-y"
                                      style={{ minHeight: "80px", width: "100%" }}
                                      placeholder="Primary text..."
                                    />
                                  </div>
                                )}

                                {ad.errorMessage && (
                                  <p className="text-[10px] text-red-500">{ad.errorMessage}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Shared fields */}
                        <div className="border-t pt-2 mt-2 space-y-1.5" style={{ maxWidth: FB_TEXT_WIDTH }}>
                          {/* Shared Body for image ads */}
                          {adSet.mediaType !== "video" && (
                            <div>
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] text-muted-foreground">Body (shared)</Label>
                                <button
                                  onClick={() => handleArrangeText(adSet.id)}
                                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                                >
                                  <AlignLeft className="h-2.5 w-2.5" />
                                  Arrange text
                                </button>
                              </div>
                              <Textarea
                                value={adSet.sharedBody}
                                onChange={(e) => updateAdSet(adSet.id, "sharedBody", e.target.value)}
                                onPaste={(e) => {
                                  e.preventDefault();
                                  const pastedText = e.clipboardData.getData('text');
                                  const arrangedText = arrangeText(pastedText);
                                  updateAdSet(adSet.id, "sharedBody", arrangedText);
                                }}
                                className="text-xs resize-y"
                                style={{ minHeight: "400px", width: "100%" }}
                                placeholder="Shared body text..."
                              />
                            </div>
                          )}
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Headline (shared)</Label>
                            <Input
                              value={adSet.sharedHeadline}
                              onChange={(e) => updateAdSet(adSet.id, "sharedHeadline", e.target.value)}
                              className="h-6 text-xs"
                              placeholder="Headline"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">URL (shared)</Label>
                            <Input
                              value={adSet.sharedUrl}
                              onChange={(e) => updateAdSet(adSet.id, "sharedUrl", e.target.value)}
                              className="h-6 text-xs"
                              placeholder="https://..."
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}

              {/* Global Schedule */}
              <div className="border-t pt-2 mt-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={globalScheduleEnabled}
                      onCheckedChange={(checked) => setGlobalScheduleEnabled(!!checked)}
                      className="h-3 w-3"
                    />
                    <Label className="text-xs flex items-center gap-1 cursor-pointer">
                      <Calendar className="h-3 w-3" />
                      Schedule All
                    </Label>
                  </div>
                  {globalScheduleEnabled && (
                    <>
                      <Input
                        type="date"
                        value={globalScheduleDate}
                        onChange={(e) => setGlobalScheduleDate(e.target.value)}
                        className="h-6 w-32 text-xs"
                      />
                      <Input
                        type="time"
                        value={globalScheduleTime}
                        onChange={(e) => setGlobalScheduleTime(e.target.value)}
                        className="h-6 w-24 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">(București)</span>
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={applyGlobalSchedule}>
                        Apply to All
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* PUBLISH ALL Button - Large, Centered */}
              <div className="flex justify-center pt-4 pb-2">
                <Button 
                  onClick={handleCreateAll} 
                  disabled={!selectedAd || isCreating} 
                  className="h-16 px-12 text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-6 w-6 mr-3 animate-spin" />
                      PUBLISHING...
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 mr-3" />
                      PUBLISH ALL ({adSetsPreview.length} Ad Sets, {totalAdsInPreview} Ads)
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!fbConnected && (
          <Card className="border-dashed border-2">
            <CardContent className="py-8 text-center">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-medium mb-1.5">Connect Your Facebook Account</h3>
              <p className="text-sm text-muted-foreground mb-3">To start creating ads, connect your Facebook account.</p>
              <Button onClick={handleFacebookLogin} size="sm">
                Connect Facebook
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Ad Account Management Modal */}
      <Dialog open={showAdAccountModal} onOpenChange={setShowAdAccountModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Manage Ad Accounts</DialogTitle>
            <DialogDescription className="text-xs">
              {isFirstConnect
                ? "Select which Ad Accounts you want to use."
                : "Enable or disable Ad Accounts."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[250px] overflow-y-auto space-y-1.5 py-3">
            {allAdAccounts.map((acc) => (
              <div
                key={acc.id}
                className={`flex items-center space-x-2 p-2 rounded border cursor-pointer transition-colors ${
                  enabledAdAccounts.includes(acc.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
                onClick={() => toggleAdAccount(acc.id)}
              >
                <Checkbox
                  checked={enabledAdAccounts.includes(acc.id)}
                  onCheckedChange={() => toggleAdAccount(acc.id)}
                  className="h-3 w-3"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{acc.name || "Unnamed Account"}</p>
                  <p className="text-[10px] text-muted-foreground">{acc.id}</p>
                </div>
              </div>
            ))}
            {allAdAccounts.length === 0 && (
              <p className="text-center text-muted-foreground py-4 text-xs">No Ad Accounts found</p>
            )}
          </div>
          {enabledAdAccounts.length > 0 && (
            <div className="border-t pt-3">
              <Label className="text-xs font-medium mb-1.5 block">Active Account:</Label>
              <div className="space-y-1">
                {enabledAdAccountsList.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAdAccount(acc.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedAdAccount === acc.id
                        ? "bg-green-100 text-green-800 border border-green-300"
                        : "hover:bg-muted"
                    }`}
                  >
                    {acc.name || acc.id}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => {
                saveEnabledAccounts(enabledAdAccounts, selectedAdAccount);
                setShowAdAccountModal(false);
                setIsFirstConnect(false);
                toast.success(`${enabledAdAccounts.length} Ad Account(s) saved`);
              }}
              disabled={enabledAdAccounts.length === 0}
            >
              Save ({enabledAdAccounts.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Ads...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Creation Complete
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/* Progress Bar */}
          <div className="w-full bg-muted rounded-full h-2 mb-3">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mb-2">{progressPercent}% complete</p>
          
          {/* Logs */}
          <div className="bg-slate-900 rounded-lg p-3 max-h-[300px] overflow-y-auto font-mono text-xs">
            {progressLogs.map((log, i) => (
              <div 
                key={i} 
                className={`${
                  log.includes('✓') ? 'text-green-400' : 
                  log.includes('✗') ? 'text-red-400' : 
                  log.includes('⚠') ? 'text-yellow-400' :
                  log.includes('===') ? 'text-blue-400 font-bold' :
                  'text-slate-300'
                }`}
              >
                {log}
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowProgressDialog(false)}
              disabled={isCreating}
            >
              {isCreating ? 'Please wait...' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
