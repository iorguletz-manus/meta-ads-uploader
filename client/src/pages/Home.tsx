import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ImagePlus, Loader2, LogOut, Upload, XCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ImageFile {
  file: File;
  preview: string;
  name: string;
  aspectRatio: string;
  base64: string;
}

interface ImageGroup {
  prefix: string;
  images: ImageFile[];
  adName: string;
  primaryText: string;
  headline: string;
  url: string;
  status: "idle" | "creating" | "success" | "error";
  errorMessage?: string;
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
  daily_budget?: string;
  lifetime_budget?: string;
}

interface Ad {
  id: string;
  name: string;
  status: string;
}

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  
  // Facebook connection state
  const [fbConnected, setFbConnected] = useState(false);
  const [fbAccessToken, setFbAccessToken] = useState<string | null>(null);
  
  // Selection state
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [selectedAdSet, setSelectedAdSet] = useState<string>("");
  const [selectedAd, setSelectedAd] = useState<string>("");
  const [newAdSetName, setNewAdSetName] = useState<string>("");
  
  // Image state
  const [imageGroups, setImageGroups] = useState<ImageGroup[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Template data (from selected ad)
  const [templateData, setTemplateData] = useState({
    primaryText: "",
    headline: "",
    url: "",
  });

  // Check for FB token in URL (OAuth callback)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        setFbAccessToken(token);
        setFbConnected(true);
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.success("Facebook connected successfully!");
      }
    }
  }, []);

  // API queries - only enabled when we have a token
  const campaignsQuery = trpc.meta.getCampaigns.useQuery(
    { accessToken: fbAccessToken || "" },
    { enabled: !!fbAccessToken && fbConnected }
  );
  
  const adSetsQuery = trpc.meta.getAdSets.useQuery(
    { accessToken: fbAccessToken || "", campaignId: selectedCampaign },
    { enabled: !!fbAccessToken && !!selectedCampaign }
  );
  
  const adsQuery = trpc.meta.getAds.useQuery(
    { accessToken: fbAccessToken || "", adSetId: selectedAdSet },
    { enabled: !!fbAccessToken && !!selectedAdSet }
  );
  
  const adDetailsQuery = trpc.meta.getAdDetails.useQuery(
    { accessToken: fbAccessToken || "", adId: selectedAd },
    { enabled: !!fbAccessToken && !!selectedAd }
  );

  // Mutations
  const createFullAdMutation = trpc.meta.createFullAd.useMutation();

  // Update template data when ad details load
  useEffect(() => {
    if (adDetailsQuery.data) {
      setTemplateData({
        primaryText: adDetailsQuery.data.primaryText || "",
        headline: adDetailsQuery.data.headline || "",
        url: adDetailsQuery.data.url || "",
      });
      // Update existing groups with template data
      setImageGroups(prev => prev.map(group => ({
        ...group,
        primaryText: group.primaryText || adDetailsQuery.data?.primaryText || "",
        headline: group.headline || adDetailsQuery.data?.headline || "",
        url: group.url || adDetailsQuery.data?.url || "",
      })));
    }
  }, [adDetailsQuery.data]);

  // Facebook Login handler
  const handleFacebookLogin = () => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (!appId) {
      toast.error("Facebook App ID not configured. Please add VITE_FACEBOOK_APP_ID to environment.");
      return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const scope = "ads_management,ads_read,business_management,pages_read_engagement";
    window.location.href = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=token`;
  };

  // Extract aspect ratio from filename
  const getAspectRatio = (filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.includes("9x16") || lower.includes("9_16")) return "9x16";
    if (lower.includes("4x5") || lower.includes("4_5")) return "4x5";
    if (lower.includes("1x1") || lower.includes("1_1")) return "1x1";
    if (lower.includes("16x9") || lower.includes("16_9")) return "16x9";
    return "other";
  };

  // Extract prefix from filename
  const getPrefix = (filename: string): string => {
    const name = filename.replace(/\.[^/.]+$/, "");
    return name
      .replace(/[_-]?(9x16|9_16|4x5|4_5|1x1|1_1|16x9|16_9)$/i, "")
      .trim();
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get pure base64
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  // Handle file drop/select
  const handleFiles = useCallback(async (files: FileList) => {
    const newImages: ImageFile[] = [];
    
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        newImages.push({
          file,
          preview: URL.createObjectURL(file),
          name: file.name,
          aspectRatio: getAspectRatio(file.name),
          base64,
        });
      }
    }

    // Group images by prefix
    const groupsMap = new Map<string, ImageFile[]>();
    
    newImages.forEach((img) => {
      const prefix = getPrefix(img.name);
      if (!groupsMap.has(prefix)) {
        groupsMap.set(prefix, []);
      }
      groupsMap.get(prefix)!.push(img);
    });

    // Create image groups
    const newGroups: ImageGroup[] = Array.from(groupsMap.entries()).map(([prefix, images]) => ({
      prefix,
      images,
      adName: prefix,
      primaryText: templateData.primaryText,
      headline: templateData.headline,
      url: templateData.url,
      status: "idle",
    }));

    setImageGroups((prev) => [...prev, ...newGroups]);
    toast.success(`Added ${newGroups.length} image group(s)`);
  }, [templateData]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  // Update group field
  const updateGroupField = (index: number, field: keyof ImageGroup, value: string) => {
    setImageGroups((prev) =>
      prev.map((group, i) =>
        i === index ? { ...group, [field]: value } : group
      )
    );
  };

  // Create single ad
  const handleCreateAd = async (index: number) => {
    if (!fbAccessToken || !selectedAd) {
      toast.error("Please connect Facebook and select a template ad");
      return;
    }

    const group = imageGroups[index];
    
    setImageGroups((prev) =>
      prev.map((g, i) => (i === index ? { ...g, status: "creating" } : g))
    );

    try {
      const result = await createFullAdMutation.mutateAsync({
        accessToken: fbAccessToken,
        templateAdId: selectedAd,
        newAdSetName: newAdSetName || `${group.adName}_adset`,
        adName: group.adName,
        primaryText: group.primaryText,
        headline: group.headline,
        url: group.url,
        images: group.images.map((img) => ({
          filename: img.name,
          aspectRatio: img.aspectRatio,
          base64: img.base64,
        })),
      });

      setImageGroups((prev) =>
        prev.map((g, i) => (i === index ? { ...g, status: "success" } : g))
      );
      toast.success(`Ad "${group.adName}" created successfully!`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setImageGroups((prev) =>
        prev.map((g, i) =>
          i === index
            ? { ...g, status: "error", errorMessage }
            : g
        )
      );
      toast.error(`Failed to create ad: ${errorMessage}`);
    }
  };

  // Create all ads
  const handleCreateAll = async () => {
    const pendingGroups = imageGroups.filter((g) => g.status !== "success");
    for (let i = 0; i < imageGroups.length; i++) {
      if (imageGroups[i].status !== "success") {
        await handleCreateAd(i);
      }
    }
  };

  // Remove group
  const removeGroup = (index: number) => {
    setImageGroups((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear all groups
  const clearAllGroups = () => {
    setImageGroups([]);
  };

  // Status icon component
  const StatusIcon = ({ status, errorMessage }: { status: string; errorMessage?: string }) => {
    switch (status) {
      case "creating":
        return (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Creating...</span>
          </div>
        );
      case "success":
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">Created</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm truncate max-w-[200px]" title={errorMessage}>
              {errorMessage || "Error"}
            </span>
          </div>
        );
      default:
        return <span className="text-sm text-muted-foreground">Ready</span>;
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in to Manus
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 gap-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Meta Ads Uploader</h1>
          <p className="text-muted-foreground">Duplicate Ad Sets and create ads with ease</p>
        </div>
        <Button asChild size="lg">
          <a href={getLoginUrl()}>Login to Get Started</a>
        </Button>
      </div>
    );
  }

  const campaigns = (campaignsQuery.data || []) as Campaign[];
  const adSets = (adSetsQuery.data || []) as AdSet[];
  const ads = (adsQuery.data || []) as Ad[];
  const pendingCount = imageGroups.filter((g) => g.status !== "success").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Upload className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold">Meta Ads Uploader</h1>
          </div>
          <div className="flex items-center gap-4">
            {fbConnected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Facebook Connected
              </div>
            ) : (
              <Button onClick={handleFacebookLogin} variant="outline" size="sm">
                Connect Facebook
              </Button>
            )}
            <div className="flex items-center gap-2 border-l pl-4">
              <span className="text-sm text-muted-foreground">{user.name}</span>
              <Button variant="ghost" size="icon" onClick={() => logout()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        {/* Step 1: Template Source */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">1</span>
              Select Template Source
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select
                value={selectedCampaign}
                onValueChange={(value) => {
                  setSelectedCampaign(value);
                  setSelectedAdSet("");
                  setSelectedAd("");
                }}
                disabled={!fbConnected}
              >
                <SelectTrigger>
                  <SelectValue placeholder={campaignsQuery.isLoading ? "Loading..." : "Select campaign..."} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ad Set</Label>
              <Select
                value={selectedAdSet}
                onValueChange={(value) => {
                  setSelectedAdSet(value);
                  setSelectedAd("");
                }}
                disabled={!selectedCampaign}
              >
                <SelectTrigger>
                  <SelectValue placeholder={adSetsQuery.isLoading ? "Loading..." : "Select ad set..."} />
                </SelectTrigger>
                <SelectContent>
                  {adSets.map((adSet) => (
                    <SelectItem key={adSet.id} value={adSet.id}>
                      {adSet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ad (Template)</Label>
              <Select
                value={selectedAd}
                onValueChange={setSelectedAd}
                disabled={!selectedAdSet}
              >
                <SelectTrigger>
                  <SelectValue placeholder={adsQuery.isLoading ? "Loading..." : "Select ad..."} />
                </SelectTrigger>
                <SelectContent>
                  {ads.map((ad) => (
                    <SelectItem key={ad.id} value={ad.id}>
                      {ad.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: New Ad Set Name */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">2</span>
              New Ad Set Name
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={newAdSetName}
              onChange={(e) => setNewAdSetName(e.target.value)}
              placeholder="Enter name for the duplicated Ad Set..."
              disabled={!selectedAdSet}
              className="max-w-xl"
            />
            <p className="text-xs text-muted-foreground mt-2">
              This will be the name of the new Ad Set created from the template
            </p>
          </CardContent>
        </Card>

        {/* Step 3: Upload Images */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">3</span>
              Upload Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-lg font-medium">Drag & drop images here</p>
                  <p className="text-sm text-muted-foreground">or click to select files</p>
                </div>
                <div className="bg-muted/50 rounded-lg px-4 py-2 text-xs text-muted-foreground">
                  <strong>Naming convention:</strong> productname_9x16.jpg, productname_4x5.jpg
                  <br />
                  Images with the same prefix will be grouped together
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Image Groups / Ads */}
        {imageGroups.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">4</span>
                Configure Ads ({imageGroups.length} groups)
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAllGroups}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
                <Button
                  onClick={handleCreateAll}
                  disabled={!selectedAd || pendingCount === 0}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Create All Ads ({pendingCount})
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {imageGroups.map((group, index) => (
                <Card 
                  key={`${group.prefix}-${index}`} 
                  className={`transition-opacity ${group.status === "success" ? "opacity-60" : ""}`}
                >
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6">
                      {/* Image previews */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Images ({group.images.length})
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {group.images.map((img, imgIndex) => (
                            <div key={imgIndex} className="relative group/img">
                              <img
                                src={img.preview}
                                alt={img.name}
                                className="h-16 w-auto rounded-lg border object-cover shadow-sm"
                              />
                              <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded-b-lg truncate text-center">
                                {img.aspectRatio}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Form fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Ad Name</Label>
                          <Input
                            value={group.adName}
                            onChange={(e) => updateGroupField(index, "adName", e.target.value)}
                            disabled={group.status === "success" || group.status === "creating"}
                            className="h-9"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">URL</Label>
                          <Input
                            value={group.url}
                            onChange={(e) => updateGroupField(index, "url", e.target.value)}
                            disabled={group.status === "success" || group.status === "creating"}
                            placeholder="https://..."
                            className="h-9"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Primary Text</Label>
                          <Textarea
                            value={group.primaryText}
                            onChange={(e) => updateGroupField(index, "primaryText", e.target.value)}
                            rows={2}
                            disabled={group.status === "success" || group.status === "creating"}
                            className="resize-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Headline</Label>
                          <Input
                            value={group.headline}
                            onChange={(e) => updateGroupField(index, "headline", e.target.value)}
                            disabled={group.status === "success" || group.status === "creating"}
                            className="h-9"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <StatusIcon status={group.status} errorMessage={group.errorMessage} />
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeGroup(index)}
                          disabled={group.status === "creating"}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleCreateAd(index)}
                          disabled={!selectedAd || group.status === "creating" || group.status === "success"}
                        >
                          {group.status === "creating" ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Creating...
                            </>
                          ) : group.status === "success" ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Created
                            </>
                          ) : (
                            "Create Ad"
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when not connected */}
        {!fbConnected && (
          <Card className="border-dashed border-2">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">Connect Your Facebook Account</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                To start creating ads, you need to connect your Facebook account with ads management permissions.
              </p>
              <Button onClick={handleFacebookLogin} size="lg">
                Connect Facebook
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Help text */}
        {fbConnected && imageGroups.length === 0 && selectedAd && (
          <Card className="border-dashed border-2 bg-muted/30">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                Upload images to start creating ads. Images will be automatically grouped by filename prefix.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
