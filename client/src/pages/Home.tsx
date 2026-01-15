import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Film,
  GripVertical,
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

interface AdGroup {
  id: string;
  prefix: string;
  media: MediaFile[];
  adName: string;
  primaryText: string;
  headline: string;
  url: string;
  status: "idle" | "creating" | "success" | "error";
  errorMessage?: string;
  adId?: string;
}

interface AdSetContainer {
  id: string;
  name: string;
  adGroups: AdGroup[];
  status: "idle" | "creating" | "success" | "error";
  createdAdSetId?: string;
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

// Draggable Ad Group Component
function DraggableAdGroup({
  group,
  onUpdate,
  onRemove,
  disabled,
}: {
  group: AdGroup;
  onUpdate: (field: keyof AdGroup, value: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const statusIcon =
    group.status === "success" ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : group.status === "error" ? (
      <XCircle className="h-4 w-4 text-red-500" />
    ) : group.status === "creating" ? (
      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    ) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg p-3 ${isDragging ? "shadow-lg" : "shadow-sm"} ${
        group.status === "success" ? "border-green-200 bg-green-50" : group.status === "error" ? "border-red-200 bg-red-50" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-1 cursor-grab active:cursor-grabbing" disabled={disabled}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {group.media.slice(0, 3).map((m) => (
                <div key={m.id} className="w-8 h-8 rounded overflow-hidden bg-muted">
                  {m.type === "image" ? (
                    <img src={m.preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {group.media.length > 3 && (
                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs">
                  +{group.media.length - 3}
                </div>
              )}
            </div>
            <Input
              value={group.adName}
              onChange={(e) => onUpdate("adName", e.target.value)}
              className="h-7 text-sm font-medium flex-1"
              placeholder="Ad name"
              disabled={disabled}
            />
            {statusIcon}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} disabled={disabled}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              value={group.primaryText}
              onChange={(e) => onUpdate("primaryText", e.target.value)}
              className="h-7 text-xs"
              placeholder="Primary text"
              disabled={disabled}
            />
            <Input
              value={group.headline}
              onChange={(e) => onUpdate("headline", e.target.value)}
              className="h-7 text-xs"
              placeholder="Headline"
              disabled={disabled}
            />
            <Input
              value={group.url}
              onChange={(e) => onUpdate("url", e.target.value)}
              className="h-7 text-xs"
              placeholder="URL"
              disabled={disabled}
            />
          </div>

          {group.errorMessage && <p className="text-xs text-red-500">{group.errorMessage}</p>}
        </div>
      </div>
    </div>
  );
}

// Ad Set Container Component
function AdSetContainerComponent({
  container,
  onRemove,
  onUpdateName,
  onUpdateAdGroup,
  onRemoveAdGroup,
  disabled,
}: {
  container: AdSetContainer;
  onRemove: () => void;
  onUpdateName: (name: string) => void;
  onUpdateAdGroup: (groupId: string, field: keyof AdGroup, value: string) => void;
  onRemoveAdGroup: (groupId: string) => void;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: `container-${container.id}`,
    data: { type: "container", containerId: container.id },
  });

  return (
    <Card
      ref={setNodeRef}
      className={`${isOver ? "ring-2 ring-primary ring-offset-2" : ""} ${
        container.status === "success" ? "border-green-300 bg-green-50/50" : container.status === "error" ? "border-red-300" : ""
      }`}
    >
      <CardHeader className="py-2 px-3">
        <div className="flex items-center gap-2">
          <Input
            value={container.name}
            onChange={(e) => onUpdateName(e.target.value)}
            className="h-7 text-sm font-medium flex-1"
            placeholder="Ad Set name"
            disabled={disabled}
          />
          {container.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {container.status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
          {container.status === "creating" && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="text-xs text-muted-foreground">{container.adGroups.length} ads</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} disabled={disabled}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-2 space-y-2 min-h-[100px]">
        <SortableContext items={container.adGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          {container.adGroups.map((group) => (
            <DraggableAdGroup
              key={group.id}
              group={group}
              onUpdate={(field, value) => onUpdateAdGroup(group.id, field, value)}
              onRemove={() => onRemoveAdGroup(group.id)}
              disabled={disabled}
            />
          ))}
        </SortableContext>
        {container.adGroups.length === 0 && (
          <div className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground text-sm">
            Drop ads here
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => window.location.reload(),
  });

  // Facebook state
  const [fbConnected, setFbConnected] = useState(false);
  const [fbAccessToken, setFbAccessToken] = useState<string | null>(null);

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

  // Pool and Ad Sets state
  const [pool, setPool] = useState<AdGroup[]>([]);
  const [adSetContainers, setAdSetContainers] = useState<AdSetContainer[]>([]);

  // Distribution settings
  const [numAdSets, setNumAdSets] = useState(1);
  const [adsPerAdSet, setAdsPerAdSet] = useState(5);

  // Schedule settings
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Template data
  const [templateData, setTemplateData] = useState({ primaryText: "", headline: "", url: "" });

  // Creating state
  const [isCreating, setIsCreating] = useState(false);

  // Sensors for drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Check for FB token in URL
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        setFbAccessToken(token);
        setFbConnected(true);
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.success("Facebook connected!");
      }
    }
  }, []);

  // API queries
  const adAccountsQuery = trpc.meta.getAdAccounts.useQuery(
    { accessToken: fbAccessToken || "" },
    { enabled: !!fbAccessToken && fbConnected }
  );

  // Load enabled accounts from localStorage on mount
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

  // When ad accounts load, check if first connect
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

  // Save enabled accounts to localStorage
  const saveEnabledAccounts = (accounts: string[]) => {
    setEnabledAdAccounts(accounts);
    localStorage.setItem("enabledAdAccounts", JSON.stringify(accounts));
    if (accounts.length > 0 && !selectedAdAccount) {
      setSelectedAdAccount(accounts[0]);
    }
  };

  // Toggle account in modal
  const toggleAdAccount = (accountId: string) => {
    setEnabledAdAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  // Get enabled ad accounts for display
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

  // Update template when ad details load
  useEffect(() => {
    if (adDetailsQuery.data) {
      const newTemplate = {
        primaryText: adDetailsQuery.data.primaryText || "",
        headline: adDetailsQuery.data.headline || "",
        url: adDetailsQuery.data.url || "",
      };
      setTemplateData(newTemplate);

      // Update pool items with template
      setPool((prev) =>
        prev.map((g) => ({
          ...g,
          primaryText: g.primaryText || newTemplate.primaryText,
          headline: g.headline || newTemplate.headline,
          url: g.url || newTemplate.url,
        }))
      );

      // Update container items with template
      setAdSetContainers((prev) =>
        prev.map((c) => ({
          ...c,
          adGroups: c.adGroups.map((g) => ({
            ...g,
            primaryText: g.primaryText || newTemplate.primaryText,
            headline: g.headline || newTemplate.headline,
            url: g.url || newTemplate.url,
          })),
        }))
      );
    }
  }, [adDetailsQuery.data]);

  // Facebook login
  const handleFacebookLogin = () => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (!appId) {
      toast.error("Facebook App ID not configured");
      return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const scope = "ads_management,ads_read,business_management";
    const url = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=token`;
    window.location.href = url;
  };

  // File upload handler
  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const newMedia: MediaFile[] = [];

      for (const file of fileArray) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) continue;

        // Extract aspect ratio from filename
        let aspectRatio = "1x1";
        const name = file.name.toLowerCase();
        if (name.includes("9x16") || name.includes("9_16")) aspectRatio = "9x16";
        else if (name.includes("4x5") || name.includes("4_5")) aspectRatio = "4x5";
        else if (name.includes("1x1") || name.includes("1_1")) aspectRatio = "1x1";
        else if (name.includes("16x9") || name.includes("16_9")) aspectRatio = "16x9";

        // Get prefix (everything before aspect ratio)
        const prefix = file.name
          .replace(/[-_]?(9x16|4x5|1x1|16x9|9_16|4_5|1_1|16_9)[-_]?/gi, "")
          .replace(/\.[^.]+$/, "")
          .trim();

        // Create preview
        const preview = URL.createObjectURL(file);

        // Convert to base64
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        newMedia.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          preview,
          name: file.name,
          aspectRatio,
          base64,
          type: isVideo ? "video" : "image",
        });
      }

      // Group by prefix
      const groups = new Map<string, MediaFile[]>();
      for (const media of newMedia) {
        const prefix = media.name
          .replace(/[-_]?(9x16|4x5|1x1|16x9|9_16|4_5|1_1|16_9)[-_]?/gi, "")
          .replace(/\.[^.]+$/, "")
          .trim();
        if (!groups.has(prefix)) {
          groups.set(prefix, []);
        }
        groups.get(prefix)!.push(media);
      }

      // Create ad groups
      const newAdGroups: AdGroup[] = [];
      groups.forEach((media, prefix) => {
        newAdGroups.push({
          id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          prefix,
          media,
          adName: prefix || "New Ad",
          primaryText: templateData.primaryText,
          headline: templateData.headline,
          url: templateData.url,
          status: "idle",
        });
      });

      setPool((prev) => [...prev, ...newAdGroups]);
      toast.success(`Added ${newAdGroups.length} ad group(s) to pool`);
    },
    [templateData]
  );

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source
    let sourceGroup: AdGroup | undefined;
    let sourceLocation: { type: "pool" } | { type: "container"; containerId: string } | undefined;

    const poolIndex = pool.findIndex((g) => g.id === activeId);
    if (poolIndex !== -1) {
      sourceGroup = pool[poolIndex];
      sourceLocation = { type: "pool" };
    }

    if (!sourceGroup) {
      for (const container of adSetContainers) {
        const idx = container.adGroups.findIndex((g) => g.id === activeId);
        if (idx !== -1) {
          sourceGroup = container.adGroups[idx];
          sourceLocation = { type: "container", containerId: container.id };
          break;
        }
      }
    }

    if (!sourceGroup || !sourceLocation) return;

    // Find destination
    let destLocation: { type: "pool" } | { type: "container"; containerId: string } | undefined;

    if (overId === "pool-drop-zone") {
      destLocation = { type: "pool" };
    } else if (overId.startsWith("container-")) {
      destLocation = { type: "container", containerId: overId.replace("container-", "") };
    } else {
      if (pool.some((g) => g.id === overId)) {
        destLocation = { type: "pool" };
      } else {
        for (const container of adSetContainers) {
          if (container.adGroups.some((g) => g.id === overId)) {
            destLocation = { type: "container", containerId: container.id };
            break;
          }
        }
      }
    }

    if (!destLocation) return;

    // Same location - no move
    if (
      sourceLocation.type === destLocation.type &&
      (sourceLocation.type === "pool" ||
        (sourceLocation.type === "container" &&
          destLocation.type === "container" &&
          sourceLocation.containerId === destLocation.containerId))
    ) {
      return;
    }

    // Remove from source
    if (sourceLocation.type === "pool") {
      setPool((prev) => prev.filter((g) => g.id !== activeId));
    } else {
      setAdSetContainers((prev) =>
        prev.map((c) =>
          c.id === sourceLocation.containerId ? { ...c, adGroups: c.adGroups.filter((g) => g.id !== activeId) } : c
        )
      );
    }

    // Add to destination
    if (destLocation.type === "pool") {
      setPool((prev) => [...prev, sourceGroup!]);
    } else {
      setAdSetContainers((prev) =>
        prev.map((c) => (c.id === destLocation.containerId ? { ...c, adGroups: [...c.adGroups, sourceGroup!] } : c))
      );
    }
  };

  // Auto-distribute
  const handleAutoDistribute = () => {
    if (pool.length === 0) {
      toast.error("No ads in pool to distribute");
      return;
    }

    const totalAds = pool.length;
    const actualNumAdSets = Math.min(numAdSets, Math.ceil(totalAds / adsPerAdSet));

    const newContainers: AdSetContainer[] = [];
    let poolCopy = [...pool];

    for (let i = 0; i < actualNumAdSets; i++) {
      const adsForThisSet = poolCopy.splice(0, adsPerAdSet);
      if (adsForThisSet.length > 0) {
        newContainers.push({
          id: `container-${Date.now()}-${i}`,
          name: `Ad Set ${i + 1}`,
          adGroups: adsForThisSet,
          status: "idle",
        });
      }
    }

    setAdSetContainers((prev) => [...prev, ...newContainers]);
    setPool(poolCopy);
    toast.success(`Created ${newContainers.length} Ad Set(s)`);
  };

  // Add empty container
  const addEmptyContainer = () => {
    setAdSetContainers((prev) => [
      ...prev,
      {
        id: `container-${Date.now()}`,
        name: `Ad Set ${prev.length + 1}`,
        adGroups: [],
        status: "idle",
      },
    ]);
  };

  // Remove container
  const removeContainer = (containerId: string) => {
    const container = adSetContainers.find((c) => c.id === containerId);
    if (container) {
      setPool((prev) => [...prev, ...container.adGroups]);
      setAdSetContainers((prev) => prev.filter((c) => c.id !== containerId));
    }
  };

  // Update container name
  const updateContainerName = (containerId: string, name: string) => {
    setAdSetContainers((prev) => prev.map((c) => (c.id === containerId ? { ...c, name } : c)));
  };

  // Update ad group in container
  const updateContainerGroup = (containerId: string, groupId: string, field: keyof AdGroup, value: string) => {
    setAdSetContainers((prev) =>
      prev.map((c) =>
        c.id === containerId
          ? { ...c, adGroups: c.adGroups.map((g) => (g.id === groupId ? { ...g, [field]: value } : g)) }
          : c
      )
    );
  };

  // Remove ad group from container
  const removeContainerGroup = (containerId: string, groupId: string) => {
    setAdSetContainers((prev) =>
      prev.map((c) => (c.id === containerId ? { ...c, adGroups: c.adGroups.filter((g) => g.id !== groupId) } : c))
    );
  };

  // Update pool group
  const updatePoolGroup = (groupId: string, field: keyof AdGroup, value: string) => {
    setPool((prev) => prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g)));
  };

  // Remove pool group
  const removePoolGroup = (groupId: string) => {
    setPool((prev) => prev.filter((g) => g.id !== groupId));
  };

  // Create all ads
  const handleCreateAll = async () => {
    if (!selectedAd || !selectedAdSet || !fbAccessToken) {
      toast.error("Please select a template ad first");
      return;
    }

    const containersWithAds = adSetContainers.filter((c) => c.adGroups.length > 0);
    if (containersWithAds.length === 0) {
      toast.error("No ads to create. Distribute ads to Ad Sets first.");
      return;
    }

    setIsCreating(true);

    // Calculate schedule time if enabled
    let scheduledTime: number | undefined;
    if (scheduleEnabled && scheduleDate && scheduleTime) {
      const bucharestDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
      // Bucharest is UTC+2 (or UTC+3 in summer)
      scheduledTime = Math.floor(bucharestDate.getTime() / 1000);
    }

    for (const container of containersWithAds) {
      // Update container status
      setAdSetContainers((prev) => prev.map((c) => (c.id === container.id ? { ...c, status: "creating" } : c)));

      try {
        const result = await batchCreateAdsMutation.mutateAsync({
          accessToken: fbAccessToken,
          templateAdId: selectedAd,
          newAdSetName: container.name,
          ads: container.adGroups.map((g) => ({
            adName: g.adName,
            primaryText: g.primaryText,
            headline: g.headline,
            url: g.url,
            media: g.media.map((m) => ({
              filename: m.name,
              base64: m.base64.split(',')[1] || m.base64,
              type: m.type,
              aspectRatio: m.aspectRatio,
            })),
          })),
          scheduledTime: scheduledTime ? new Date(scheduledTime * 1000).toISOString() : undefined,
        });

        // Update container and ad statuses
        const updatedGroups = container.adGroups.map((g, idx) => {
          const adResult = result.results[idx];
          return {
            ...g,
            status: adResult?.success ? ("success" as const) : ("error" as const),
            adId: adResult?.adId,
            errorMessage: adResult?.error,
          };
        });

        const allSuccess = updatedGroups.every((g) => g.status === "success");
        const hasError = updatedGroups.some((g) => g.status === "error");

        setAdSetContainers((prev) =>
          prev.map((c) => {
            if (c.id !== container.id) return c;
            return {
              ...c,
              status: allSuccess ? "success" : hasError ? "error" : "idle",
              createdAdSetId: result.adSetId,
              adGroups: updatedGroups,
            };
          })
        );

        toast.success(`Ad Set "${container.name}" created!`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setAdSetContainers((prev) =>
          prev.map((c) =>
            c.id === container.id
              ? { ...c, status: "error", adGroups: c.adGroups.map((g) => ({ ...g, status: "error", errorMessage })) }
              : c
          )
        );
        toast.error(`Failed to create "${container.name}": ${errorMessage}`);
      }
    }

    setIsCreating(false);
  };

  // Find active group for overlay
  const findActiveGroup = (): AdGroup | undefined => {
    if (!activeId) return undefined;
    const inPool = pool.find((g) => g.id === activeId);
    if (inPool) return inPool;
    for (const c of adSetContainers) {
      const inContainer = c.adGroups.find((g) => g.id === activeId);
      if (inContainer) return inContainer;
    }
    return undefined;
  };

  const campaigns = (campaignsQuery.data || []) as Campaign[];
  const adSets = (adSetsQuery.data || []) as AdSet[];
  const ads = (adsQuery.data || []) as Ad[];
  const totalAdsInContainers = adSetContainers.reduce((sum, c) => sum + c.adGroups.length, 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
                  {/* Ad Account Selector in Header */}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdAccountModal(true)}
                      className="text-muted-foreground"
                    >
                      Select Ad Account
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdAccountModal(true)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Manage Ad Accounts
                  </Button>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
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
          {/* Step 1: Template Selection - 3 Column Layout */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
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
                <div className="grid grid-cols-3 gap-4 h-[400px]">
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
                        Inactive
                      </label>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-1">
                        {campaignsQuery.isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : campaigns.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No campaigns found</p>
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
                                selectedCampaign === c.id
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted"
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
                        Inactive
                      </label>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-1">
                        {!selectedCampaign ? (
                          <p className="text-xs text-muted-foreground text-center py-4">Select a campaign first</p>
                        ) : adSetsQuery.isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : adSets.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No ad sets found</p>
                        ) : (
                          adSets.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => {
                                setSelectedAdSet(a.id);
                                setSelectedAd("");
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                selectedAdSet === a.id
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted"
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

                  {/* Column 3: Ads with Thumbnails */}
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
                        Inactive
                      </label>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-1">
                        {!selectedAdSet ? (
                          <p className="text-xs text-muted-foreground text-center py-4">Select an ad set first</p>
                        ) : adsQuery.isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : ads.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No ads found</p>
                        ) : (
                          ads.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => setSelectedAd(a.id)}
                              className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                                selectedAd === a.id
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {/* Thumbnail */}
                              <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                                {a.creative?.thumbnail_url || a.creative?.image_url ? (
                                  <img
                                    src={a.creative.thumbnail_url || a.creative.image_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
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

          {/* Step 2: Pool with Upload */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
                    2
                  </span>
                  Media Pool ({pool.length} ads)
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Label className="text-xs text-muted-foreground">Ad Sets:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={numAdSets}
                      onChange={(e) => setNumAdSets(parseInt(e.target.value) || 1)}
                      className="h-7 w-16 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Label className="text-xs text-muted-foreground">Ads/Set:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={adsPerAdSet}
                      onChange={(e) => setAdsPerAdSet(parseInt(e.target.value) || 1)}
                      className="h-7 w-16 text-sm"
                    />
                  </div>
                  <Button size="sm" onClick={handleAutoDistribute} disabled={pool.length === 0}>
                    Distribute
                  </Button>
                  <Button size="sm" variant="outline" onClick={addEmptyContainer}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ad Set
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Upload Zone / Pool */}
              <div
                id="pool-drop-zone"
                className="border-2 border-dashed rounded-lg p-4 min-h-[200px] transition-colors hover:border-primary/50"
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
              >
                {pool.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <div className="flex gap-2 mb-2">
                      <ImagePlus className="h-8 w-8" />
                      <Film className="h-8 w-8" />
                    </div>
                    <p className="font-medium">Drop images & videos here</p>
                    <p className="text-xs">Name files like: product_9x16.jpg, product_4x5.mp4</p>
                  </div>
                ) : (
                  <SortableContext items={pool.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {pool.map((group) => (
                        <DraggableAdGroup
                          key={group.id}
                          group={group}
                          onUpdate={(field, value) => updatePoolGroup(group.id, field, value)}
                          onRemove={() => removePoolGroup(group.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Ad Set Containers */}
          {adSetContainers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
                      3
                    </span>
                    Ad Sets ({adSetContainers.length})
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {adSetContainers.map((container) => (
                    <div key={container.id} id={`container-${container.id}`}>
                      <AdSetContainerComponent
                        container={container}
                        onRemove={() => removeContainer(container.id)}
                        onUpdateName={(name) => updateContainerName(container.id, name)}
                        onUpdateAdGroup={(groupId, field, value) => updateContainerGroup(container.id, groupId, field, value)}
                        onRemoveAdGroup={(groupId) => removeContainerGroup(container.id, groupId)}
                        disabled={isCreating || container.status === "success"}
                      />
                    </div>
                  ))}
                </div>

                {/* Create All Button */}
                {totalAdsInContainers > 0 && (
                  <div className="flex justify-end pt-2">
                    <Button size="lg" onClick={handleCreateAll} disabled={!selectedAd || isCreating} className="px-8">
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Create All ({adSetContainers.length} Ad Sets, {totalAdsInContainers} Ads)
                          {scheduleEnabled && scheduleDate && scheduleTime && (
                            <span className="ml-2 text-xs opacity-75">
                              @ {scheduleDate} {scheduleTime}
                            </span>
                          )}
                        </>
                      )}
                    </Button>
                  </div>
                )}
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
      </div>

      {/* Ad Account Management Modal */}
      <Dialog open={showAdAccountModal} onOpenChange={setShowAdAccountModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Ad Accounts</DialogTitle>
            <DialogDescription>
              {isFirstConnect
                ? "Select which Ad Accounts you want to use in this app."
                : "Enable or disable Ad Accounts for the dropdown."}
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
          {/* Select active account */}
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

      {/* Drag Overlay */}
      <DragOverlay>
        {activeId && findActiveGroup() && (
          <div className="bg-white border-2 border-primary rounded-lg p-3 shadow-xl opacity-90">
            <div className="flex items-center gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{findActiveGroup()?.adName}</span>
              <span className="text-sm text-muted-foreground">({findActiveGroup()?.media.length} files)</span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
