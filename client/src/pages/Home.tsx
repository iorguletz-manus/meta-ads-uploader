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
  Clock,
  Film,
  FolderOpen,
  ImagePlus,
  Loader2,
  LogOut,
  Plus,
  Settings,
  Trash2,
  Upload,
  XCircle,
  Eye,
  EyeOff,
  Play,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Types
interface MediaFile {
  id: string;
  file: File;
  preview: string;
  name: string;
  aspectRatio: string;
  base64: string;
  type: "image" | "video";
}

interface AdData {
  id: string;
  adName: string;
  hook: string; // For images
  primaryText: string; // For videos
  media: MediaFile[];
  status: "idle" | "creating" | "success" | "error";
  errorMessage?: string;
  adId?: string;
}

interface AdSetData {
  id: string;
  name: string;
  ads: AdData[];
  sharedBody: string; // Shared body for image ads
  sharedHeadline: string;
  sharedUrl: string;
  status: "idle" | "creating" | "success" | "error";
  createdAdSetId?: string;
  isExpanded: boolean;
  mediaType: "image" | "video" | "mixed";
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

export default function Home() {
  // Auth state
  const { data: user, isLoading: authLoading } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  // Facebook state
  const [fbConnected, setFbConnected] = useState(false);
  const [fbAccessToken, setFbAccessToken] = useState<string | null>(null);

  // Google Drive state
  const [gdriveConnected, setGdriveConnected] = useState(false);

  // Ad Account state
  const [allAdAccounts, setAllAdAccounts] = useState<AdAccount[]>([]);
  const [enabledAdAccounts, setEnabledAdAccounts] = useState<string[]>([]);
  const [selectedAdAccount, setSelectedAdAccount] = useState("");
  const [showAdAccountModal, setShowAdAccountModal] = useState(false);
  const [isFirstConnect, setIsFirstConnect] = useState(false);

  // Selection state
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedAdSet, setSelectedAdSet] = useState("");
  const [selectedAd, setSelectedAd] = useState("");

  // Show inactive toggles
  const [showInactiveCampaigns, setShowInactiveCampaigns] = useState(false);
  const [showInactiveAdSets, setShowInactiveAdSets] = useState(false);
  const [showInactiveAds, setShowInactiveAds] = useState(false);

  // Media pool (Step 2)
  const [mediaPool, setMediaPool] = useState<MediaFile[]>([]);

  // Distribution settings (Step 3)
  const [numAdSets, setNumAdSets] = useState(1);
  const [adsPerAdSet, setAdsPerAdSet] = useState(5);
  const [showPreview, setShowPreview] = useState(false);

  // Ad Sets for preview (Step 4)
  const [adSetsPreview, setAdSetsPreview] = useState<AdSetData[]>([]);

  // Schedule settings
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Creating state
  const [isCreating, setIsCreating] = useState(false);

  // Query for saved Facebook token
  const savedTokenQuery = trpc.meta.getSavedToken.useQuery(undefined, {
    enabled: !!user && !fbConnected,
  });

  // Mutation to save Facebook token
  const saveTokenMutation = trpc.meta.saveFacebookToken.useMutation();

  // Auto-connect if we have a saved token
  useEffect(() => {
    if (savedTokenQuery.data && !fbConnected) {
      setFbAccessToken(savedTokenQuery.data.accessToken);
      setFbConnected(true);
      toast.success("Facebook auto-connected!");
    }
  }, [savedTokenQuery.data, fbConnected]);

  // Check for FB token in URL (OAuth callback)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      const expiresIn = params.get("expires_in");
      if (token) {
        setFbAccessToken(token);
        setFbConnected(true);
        window.history.replaceState({}, document.title, window.location.pathname);
        const expiry = expiresIn ? parseInt(expiresIn) : 5184000;
        saveTokenMutation.mutate({ accessToken: token, expiresIn: expiry });
        toast.success("Facebook connected!");
      }
    }
  }, []);

  // API queries
  const adAccountsQuery = trpc.meta.getAdAccounts.useQuery(
    { accessToken: fbAccessToken || "" },
    { enabled: !!fbAccessToken && fbConnected }
  );

  // Load enabled accounts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("enabledAdAccounts");
    if (saved) {
      try {
        setEnabledAdAccounts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved ad accounts", e);
      }
    }
  }, []);

  // When ad accounts load
  useEffect(() => {
    if (adAccountsQuery.data && adAccountsQuery.data.length > 0) {
      setAllAdAccounts(adAccountsQuery.data as AdAccount[]);
      const saved = localStorage.getItem("enabledAdAccounts");
      if (!saved) {
        setIsFirstConnect(true);
        setShowAdAccountModal(true);
      }
    }
  }, [adAccountsQuery.data]);

  const saveEnabledAccounts = (accounts: string[]) => {
    setEnabledAdAccounts(accounts);
    localStorage.setItem("enabledAdAccounts", JSON.stringify(accounts));
    if (accounts.length > 0 && !selectedAdAccount) {
      setSelectedAdAccount(accounts[0]);
    }
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

  // Google Drive Connect (placeholder)
  const handleGoogleDriveConnect = () => {
    toast.info("Google Drive integration coming soon!");
    // TODO: Implement Google Drive OAuth
  };

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList) => {
    const newMedia: MediaFile[] = [];

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (!isVideo && !isImage) continue;

      const preview = URL.createObjectURL(file);
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Extract aspect ratio from filename
      let aspectRatio = "1x1";
      const name = file.name.toLowerCase();
      if (name.includes("9x16") || name.includes("9_16")) aspectRatio = "9x16";
      else if (name.includes("4x5") || name.includes("4_5")) aspectRatio = "4x5";
      else if (name.includes("1x1") || name.includes("1_1")) aspectRatio = "1x1";
      else if (name.includes("16x9") || name.includes("16_9")) aspectRatio = "16x9";

      newMedia.push({
        id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview,
        name: file.name,
        aspectRatio,
        base64,
        type: isVideo ? "video" : "image",
      });
    }

    setMediaPool((prev) => [...prev, ...newMedia]);
    toast.success(`${newMedia.length} file(s) added`);
  }, []);

  // Group media by prefix
  const groupMediaByPrefix = (media: MediaFile[]): Map<string, MediaFile[]> => {
    const groups = new Map<string, MediaFile[]>();
    
    for (const m of media) {
      // Extract prefix (everything before _9x16, _4x5, etc.)
      const prefix = m.name
        .replace(/\.(jpg|jpeg|png|gif|mp4|mov|webm)$/i, "")
        .replace(/[_-]?(9x16|4x5|1x1|16x9|9_16|4_5|1_1|16_9)$/i, "")
        .toLowerCase();
      
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix)!.push(m);
    }
    
    return groups;
  };

  // Distribute media into ad sets
  const handleDistribute = () => {
    if (mediaPool.length === 0) {
      toast.error("Upload some media first");
      return;
    }

    const groups = groupMediaByPrefix(mediaPool);
    const groupsArray = Array.from(groups.entries());
    
    // Determine media type
    const hasImages = mediaPool.some(m => m.type === "image");
    const hasVideos = mediaPool.some(m => m.type === "video");
    const mediaType: "image" | "video" | "mixed" = hasImages && hasVideos ? "mixed" : hasVideos ? "video" : "image";

    // Create ad sets
    const newAdSets: AdSetData[] = [];
    let groupIndex = 0;

    for (let i = 0; i < numAdSets; i++) {
      const ads: AdData[] = [];
      
      for (let j = 0; j < adsPerAdSet && groupIndex < groupsArray.length; j++) {
        const [prefix, media] = groupsArray[groupIndex];
        ads.push({
          id: `ad-${Date.now()}-${groupIndex}`,
          adName: prefix,
          hook: "",
          primaryText: "",
          media,
          status: "idle",
        });
        groupIndex++;
      }

      if (ads.length > 0) {
        newAdSets.push({
          id: `adset-${Date.now()}-${i}`,
          name: `Ad Set ${i + 1}`,
          ads,
          sharedBody: "",
          sharedHeadline: "",
          sharedUrl: adDetailsQuery.data?.url || "",
          status: "idle",
          isExpanded: true,
          mediaType,
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
          ? { ...as, ads: as.ads.map((ad) => (ad.id === adId ? { ...ad, [field]: value } : ad)) }
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

    setIsCreating(true);

    let scheduledTime: number | undefined;
    if (scheduleEnabled && scheduleDate && scheduleTime) {
      const bucharestDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
      scheduledTime = Math.floor(bucharestDate.getTime() / 1000);
    }

    for (const adSet of adSetsWithAds) {
      setAdSetsPreview((prev) =>
        prev.map((as) => (as.id === adSet.id ? { ...as, status: "creating" } : as))
      );

      try {
        // Prepare ads with combined primary text
        const adsToCreate = adSet.ads.map((ad) => {
          let primaryText = "";
          if (adSet.mediaType === "image" || adSet.mediaType === "mixed") {
            // Combine hook + body for images
            primaryText = ad.hook ? `${ad.hook}\n\n${adSet.sharedBody}` : adSet.sharedBody;
          } else {
            // Use direct primary text for videos
            primaryText = ad.primaryText;
          }

          return {
            adName: ad.adName,
            primaryText,
            headline: adSet.sharedHeadline,
            url: adSet.sharedUrl,
            media: ad.media.map((m) => ({
              filename: m.name,
              base64: m.base64.split(",")[1] || m.base64,
              type: m.type,
              aspectRatio: m.aspectRatio,
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

        // Update statuses
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
            as.id === adSet.id
              ? { ...as, status: allSuccess ? "success" : "error", createdAdSetId: result.adSetId, ads: updatedAds }
              : as
          )
        );

        toast.success(`Ad Set "${adSet.name}" created!`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setAdSetsPreview((prev) =>
          prev.map((as) =>
            as.id === adSet.id
              ? { ...as, status: "error", ads: as.ads.map((ad) => ({ ...ad, status: "error", errorMessage })) }
              : as
          )
        );
        toast.error(`Failed: ${errorMessage}`);
      }
    }

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
      if (scheduleEnabled && scheduleDate && scheduleTime) {
        const bucharestDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
        scheduledTime = Math.floor(bucharestDate.getTime() / 1000);
      }

      const adsToCreate = adSet.ads.map((ad) => {
        let primaryText = "";
        if (adSet.mediaType === "image" || adSet.mediaType === "mixed") {
          primaryText = ad.hook ? `${ad.hook}\n\n${adSet.sharedBody}` : adSet.sharedBody;
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
            base64: m.base64.split(",")[1] || m.base64,
            type: m.type,
            aspectRatio: m.aspectRatio,
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

  const campaigns = (campaignsQuery.data || []) as Campaign[];
  const adSets = (adSetsQuery.data || []) as AdSet[];
  const ads = (adsQuery.data || []) as Ad[];
  const totalAdsInPreview = adSetsPreview.reduce((sum, as) => sum + as.ads.length, 0);

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
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Upload className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-lg font-semibold">Meta Ads Uploader</h1>
          </div>
          <div className="flex items-center gap-3">
            {fbConnected ? (
              <>
                {selectedAdAccount && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-700">{selectedAccountName || selectedAdAccount}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-green-600 hover:text-green-800 hover:bg-green-100"
                      onClick={() => setShowAdAccountModal(true)}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {!selectedAdAccount && (
                  <Button variant="outline" size="sm" onClick={() => setShowAdAccountModal(true)}>
                    Select Ad Account
                  </Button>
                )}
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  FB Connected
                </span>
              </>
            ) : (
              <Button onClick={handleFacebookLogin} variant="outline" size="sm">
                Connect Facebook
              </Button>
            )}
            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-sm text-muted-foreground">{user?.name || "User"}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => logoutMutation.mutate()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Step 1: Select Template Ad */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                1
              </span>
              Select Template Ad
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!fbConnected || !selectedAdAccount ? (
              <div className="text-center py-8 text-muted-foreground">
                {!fbConnected ? "Connect Facebook to see your campaigns" : "Select an Ad Account from the header"}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 h-[350px]">
                {/* Column 1: Campaigns */}
                <div className="border rounded-lg flex flex-col">
                  <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
                    <span className="text-sm font-medium">Campaigns</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={showInactiveCampaigns}
                        onCheckedChange={(checked) => setShowInactiveCampaigns(!!checked)}
                        className="h-3.5 w-3.5"
                      />
                      {showInactiveCampaigns ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </label>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {campaignsQuery.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : campaigns.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No campaigns</p>
                      ) : (
                        campaigns.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCampaign(c.id);
                              setSelectedAdSet("");
                              setSelectedAd("");
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                              selectedCampaign === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                            }`}
                          >
                            <div className="font-medium truncate">{c.name}</div>
                            <div className="text-xs opacity-70">{c.status}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Column 2: Ad Sets */}
                <div className="border rounded-lg flex flex-col">
                  <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
                    <span className="text-sm font-medium">Ad Sets</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={showInactiveAdSets}
                        onCheckedChange={(checked) => setShowInactiveAdSets(!!checked)}
                        className="h-3.5 w-3.5"
                      />
                      {showInactiveAdSets ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </label>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {!selectedCampaign ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Select a campaign</p>
                      ) : adSetsQuery.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : adSets.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No ad sets</p>
                      ) : (
                        adSets.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setSelectedAdSet(a.id);
                              setSelectedAd("");
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                              selectedAdSet === a.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                            }`}
                          >
                            <div className="font-medium truncate">{a.name}</div>
                            <div className="text-xs opacity-70">{a.status}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Column 3: Ads */}
                <div className="border rounded-lg flex flex-col">
                  <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
                    <span className="text-sm font-medium">Ads</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={showInactiveAds}
                        onCheckedChange={(checked) => setShowInactiveAds(!!checked)}
                        className="h-3.5 w-3.5"
                      />
                      {showInactiveAds ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </label>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {!selectedAdSet ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Select an ad set</p>
                      ) : adsQuery.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : ads.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No ads</p>
                      ) : (
                        ads.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAd(a.id)}
                            className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                              selectedAd === a.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                            }`}
                          >
                            <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                              {a.creative?.thumbnail_url || a.creative?.image_url ? (
                                <img src={a.creative.thumbnail_url || a.creative.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImagePlus className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{a.name}</div>
                              <div className="text-xs opacity-70">{a.status}</div>
                            </div>
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                2
              </span>
              Upload Media (Images / Videos)
              {mediaPool.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">({mediaPool.length} files)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {/* Upload Zone */}
              <div
                className="flex-1 border-2 border-dashed rounded-lg p-6 min-h-[200px] transition-colors hover:border-primary/50 cursor-pointer"
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
                    <div className="flex gap-3 mb-3">
                      <ImagePlus className="h-10 w-10" />
                      <Film className="h-10 w-10" />
                    </div>
                    <p className="font-medium text-lg">Drop images & videos here</p>
                    <p className="text-sm mt-1">or click to browse</p>
                    <p className="text-xs mt-3 text-muted-foreground/70">
                      Name files like: product_9x16.jpg, product_4x5.mp4
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {mediaPool.map((m) => (
                      <div key={m.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                        {m.type === "image" ? (
                          <img src={m.preview} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-800">
                            <Play className="h-8 w-8 text-white" />
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaPool((prev) => prev.filter((p) => p.id !== m.id));
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 truncate">
                          {m.aspectRatio}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Google Drive Button */}
              <div className="w-48 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={handleGoogleDriveConnect}
                >
                  <FolderOpen className="h-6 w-6" />
                  <span className="text-sm">Import from Google Drive</span>
                </Button>
                {gdriveConnected && (
                  <span className="text-xs text-green-600 text-center flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Establish Nr of Adsets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                3
              </span>
              Establish Nr of Adsets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Label className="text-sm">Number of Ad Sets:</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={numAdSets}
                  onChange={(e) => setNumAdSets(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm">Ads per Ad Set:</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={adsPerAdSet}
                  onChange={(e) => setAdsPerAdSet(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              </div>
              <Button onClick={handleDistribute} disabled={mediaPool.length === 0} size="lg">
                Distribute
              </Button>
            </div>
            {mediaPool.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {mediaPool.length} files will be grouped and distributed into {numAdSets} Ad Set(s) with up to {adsPerAdSet} ads each.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Preview (only shown after Distribute) */}
        {showPreview && adSetsPreview.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                    4
                  </span>
                  Preview
                  <span className="text-sm font-normal text-muted-foreground">
                    ({adSetsPreview.length} Ad Sets, {totalAdsInPreview} Ads)
                  </span>
                </CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="schedule"
                      checked={scheduleEnabled}
                      onCheckedChange={(checked) => setScheduleEnabled(!!checked)}
                    />
                    <Label htmlFor="schedule" className="text-sm flex items-center gap-1 cursor-pointer">
                      <Calendar className="h-3.5 w-3.5" />
                      Schedule
                    </Label>
                  </div>
                  {scheduleEnabled && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="h-8 w-36"
                      />
                      <Input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="h-8 w-28"
                      />
                      <span className="text-xs text-muted-foreground">(București)</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {adSetsPreview.map((adSet) => (
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
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateAdSet(adSet.id, "isExpanded", !adSet.isExpanded)}
                        >
                          {adSet.isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Input
                          value={adSet.name}
                          onChange={(e) => updateAdSet(adSet.id, "name", e.target.value)}
                          className="h-8 font-medium max-w-xs"
                          placeholder="Ad Set Name"
                        />
                        <span className="text-sm text-muted-foreground">({adSet.ads.length} ads)</span>
                        {adSet.status === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {adSet.status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                        {adSet.status === "creating" && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleCreateSingleAdSet(adSet.id)}
                          disabled={isCreating || adSet.status === "success" || !selectedAd}
                        >
                          {adSet.status === "creating" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Create This Ad Set"
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => removeAdSet(adSet.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {adSet.isExpanded && (
                    <CardContent className="pt-0 px-4 pb-4">
                      <div className="flex gap-6">
                        {/* Left side: Ads list */}
                        <div className="flex-1 space-y-3">
                          {adSet.ads.map((ad, adIndex) => (
                            <div
                              key={ad.id}
                              className={`border rounded-lg p-3 ${
                                ad.status === "success"
                                  ? "border-green-200 bg-green-50"
                                  : ad.status === "error"
                                  ? "border-red-200 bg-red-50"
                                  : ""
                              }`}
                            >
                              <div className="flex gap-4">
                                {/* Ad fields */}
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs w-20 text-muted-foreground">Ad Name:</Label>
                                    <Input
                                      value={ad.adName}
                                      onChange={(e) => updateAd(adSet.id, ad.id, "adName", e.target.value)}
                                      className="h-7 text-sm flex-1"
                                      placeholder="Ad name"
                                    />
                                    {ad.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                    {ad.status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => removeAd(adSet.id, ad.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>

                                  {/* For images: Hook field */}
                                  {adSet.mediaType !== "video" && (
                                    <div className="flex items-start gap-2">
                                      <Label className="text-xs w-20 text-muted-foreground pt-2">Hook {adIndex + 1}:</Label>
                                      <Textarea
                                        value={ad.hook}
                                        onChange={(e) => updateAd(adSet.id, ad.id, "hook", e.target.value)}
                                        className="flex-1 text-sm resize-y"
                                        style={{ minHeight: "225px" }}
                                        placeholder="Hook text for this ad..."
                                      />
                                    </div>
                                  )}

                                  {/* For videos: Primary Text field */}
                                  {adSet.mediaType === "video" && (
                                    <div className="flex items-start gap-2">
                                      <Label className="text-xs w-20 text-muted-foreground pt-2">Primary Text:</Label>
                                      <Textarea
                                        value={ad.primaryText}
                                        onChange={(e) => updateAd(adSet.id, ad.id, "primaryText", e.target.value)}
                                        className="flex-1 text-sm resize-y"
                                        style={{ minHeight: "100px" }}
                                        placeholder="Primary text..."
                                      />
                                    </div>
                                  )}

                                  {ad.errorMessage && (
                                    <p className="text-xs text-red-500 ml-20">{ad.errorMessage}</p>
                                  )}
                                </div>

                                {/* Media preview */}
                                <div className="flex-shrink-0">
                                  {ad.media.length > 0 && (
                                    <div className="space-y-2">
                                      {ad.media.map((m) => (
                                        <div
                                          key={m.id}
                                          className="rounded-lg overflow-hidden bg-muted"
                                          style={{
                                            width: m.type === "video" ? "320px" : "200px",
                                            height: m.type === "video" ? "180px" : "200px",
                                          }}
                                        >
                                          {m.type === "image" ? (
                                            <img src={m.preview} alt="" className="w-full h-full object-cover" />
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
                              </div>
                            </div>
                          ))}

                          {/* Shared fields for image ads */}
                          {adSet.mediaType !== "video" && (
                            <div className="border-t pt-4 mt-4 space-y-3">
                              <div className="flex items-start gap-2">
                                <Label className="text-xs w-20 text-muted-foreground pt-2">Body:</Label>
                                <Textarea
                                  value={adSet.sharedBody}
                                  onChange={(e) => updateAdSet(adSet.id, "sharedBody", e.target.value)}
                                  className="flex-1 text-sm resize-y"
                                  style={{ minHeight: "485px" }}
                                  placeholder="Shared body text (combined with each hook)..."
                                />
                              </div>
                            </div>
                          )}

                          {/* Shared Headline and URL */}
                          <div className="border-t pt-4 mt-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs w-20 text-muted-foreground">Headline:</Label>
                              <Input
                                value={adSet.sharedHeadline}
                                onChange={(e) => updateAdSet(adSet.id, "sharedHeadline", e.target.value)}
                                className="flex-1 h-8 text-sm"
                                placeholder="Shared headline for all ads"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs w-20 text-muted-foreground">URL:</Label>
                              <Input
                                value={adSet.sharedUrl}
                                onChange={(e) => updateAdSet(adSet.id, "sharedUrl", e.target.value)}
                                className="flex-1 h-8 text-sm"
                                placeholder="https://..."
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}

              {/* Create All Button */}
              <div className="flex justify-end pt-4">
                <Button size="lg" onClick={handleCreateAll} disabled={!selectedAd || isCreating} className="px-8">
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Create All ({adSetsPreview.length} Ad Sets, {totalAdsInPreview} Ads)
                      {scheduleEnabled && scheduleDate && scheduleTime && (
                        <span className="ml-2 text-xs opacity-75">@ {scheduleDate} {scheduleTime}</span>
                      )}
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
            <CardContent className="py-12 text-center">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Connect Your Facebook Account</h3>
              <p className="text-muted-foreground mb-4">To start creating ads, connect your Facebook account.</p>
              <Button onClick={handleFacebookLogin} size="lg">
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
            <DialogTitle>Manage Ad Accounts</DialogTitle>
            <DialogDescription>
              {isFirstConnect
                ? "Select which Ad Accounts you want to use."
                : "Enable or disable Ad Accounts."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2 py-4">
            {allAdAccounts.map((acc) => (
              <div
                key={acc.id}
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  enabledAdAccounts.includes(acc.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
                onClick={() => toggleAdAccount(acc.id)}
              >
                <Checkbox
                  checked={enabledAdAccounts.includes(acc.id)}
                  onCheckedChange={() => toggleAdAccount(acc.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{acc.name || "Unnamed Account"}</p>
                  <p className="text-xs text-muted-foreground">{acc.id}</p>
                </div>
              </div>
            ))}
            {allAdAccounts.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No Ad Accounts found</p>
            )}
          </div>
          {enabledAdAccounts.length > 0 && (
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Active Account:</Label>
              <div className="space-y-1">
                {enabledAdAccountsList.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAdAccount(acc.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
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
              onClick={() => {
                saveEnabledAccounts(enabledAdAccounts);
                setShowAdAccountModal(false);
                setIsFirstConnect(false);
                toast.success(`${enabledAdAccounts.length} Ad Account(s) enabled`);
              }}
              disabled={enabledAdAccounts.length === 0}
            >
              Save ({enabledAdAccounts.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
