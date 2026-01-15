import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Trash2,
  Upload,
  XCircle,
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
}

// Draggable Ad Group Component
function DraggableAdGroup({
  group,
  onUpdate,
  onRemove,
  disabled,
  compact = false,
}: {
  group: AdGroup;
  onUpdate: (field: keyof AdGroup, value: string) => void;
  onRemove: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-white border rounded-lg p-2 ${isDragging ? "shadow-lg ring-2 ring-primary" : "shadow-sm"}`}
      >
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex gap-1">
            {group.media.slice(0, 2).map((m, i) => (
              <div key={i} className="relative w-8 h-8">
                {m.type === "video" ? (
                  <div className="w-full h-full bg-slate-700 rounded flex items-center justify-center">
                    <Film className="h-3 w-3 text-white" />
                  </div>
                ) : (
                  <img src={m.preview} alt="" className="w-full h-full object-cover rounded" />
                )}
              </div>
            ))}
          </div>
          <span className="text-sm font-medium truncate flex-1">{group.adName}</span>
          <StatusBadge status={group.status} errorMessage={group.errorMessage} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg p-3 ${isDragging ? "shadow-lg ring-2 ring-primary" : "shadow-sm"}`}
    >
      <div className="flex gap-3">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-6 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Media previews */}
        <div className="flex gap-1 flex-shrink-0">
          {group.media.slice(0, 3).map((m, i) => (
            <div key={i} className="relative w-12 h-12">
              {m.type === "video" ? (
                <div className="w-full h-full bg-slate-700 rounded flex items-center justify-center">
                  <Film className="h-5 w-5 text-white" />
                </div>
              ) : (
                <img src={m.preview} alt="" className="w-full h-full object-cover rounded" />
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] text-center truncate px-0.5">
                {m.aspectRatio}
              </span>
            </div>
          ))}
          {group.media.length > 3 && (
            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
              +{group.media.length - 3}
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          <Input
            value={group.adName}
            onChange={(e) => onUpdate("adName", e.target.value)}
            placeholder="Ad Name"
            disabled={disabled}
            className="h-8 text-sm"
          />
          <Input
            value={group.url}
            onChange={(e) => onUpdate("url", e.target.value)}
            placeholder="URL"
            disabled={disabled}
            className="h-8 text-sm"
          />
          <Input
            value={group.primaryText}
            onChange={(e) => onUpdate("primaryText", e.target.value)}
            placeholder="Primary Text"
            disabled={disabled}
            className="h-8 text-sm"
          />
          <Input
            value={group.headline}
            onChange={(e) => onUpdate("headline", e.target.value)}
            placeholder="Headline"
            disabled={disabled}
            className="h-8 text-sm"
          />
        </div>

        {/* Status & Actions */}
        <div className="flex flex-col items-end justify-between">
          <StatusBadge status={group.status} errorMessage={group.errorMessage} />
          <Button variant="ghost" size="icon" onClick={onRemove} disabled={disabled} className="h-7 w-7">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status, errorMessage }: { status: string; errorMessage?: string }) {
  switch (status) {
    case "creating":
      return (
        <span className="flex items-center gap-1 text-xs text-blue-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Creating
        </span>
      );
    case "success":
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Created
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs text-red-600" title={errorMessage}>
          <XCircle className="h-3 w-3" />
          Error
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">Ready</span>;
  }
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
  disabled: boolean;
}) {
  return (
    <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={container.name}
              onChange={(e) => onUpdateName(e.target.value)}
              className="h-8 max-w-xs font-medium"
              disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">({container.adGroups.length} ads)</span>
            <StatusBadge status={container.status} />
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove} disabled={disabled}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-[80px]">
        <SortableContext items={container.adGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {container.adGroups.length === 0 ? (
              <div className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground text-sm">
                Drag ads here from the pool
              </div>
            ) : (
              container.adGroups.map((group) => (
                <DraggableAdGroup
                  key={group.id}
                  group={group}
                  onUpdate={(field, value) => onUpdateAdGroup(group.id, field, value)}
                  onRemove={() => onRemoveAdGroup(group.id)}
                  disabled={disabled || group.status !== "idle"}
                  compact
                />
              ))
            )}
          </div>
        </SortableContext>
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

  // Selection state
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedAdSet, setSelectedAdSet] = useState("");
  const [selectedAd, setSelectedAd] = useState("");

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
    }
  }, [adDetailsQuery.data]);

  // Facebook Login
  const handleFacebookLogin = () => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (!appId) {
      toast.error("Facebook App ID not configured");
      return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const scope = "ads_management,ads_read,business_management,pages_read_engagement";
    window.location.href = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=token`;
  };

  // Helper functions
  const generateId = () => Math.random().toString(36).substring(2, 11);

  const getAspectRatio = (filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.includes("9x16") || lower.includes("9_16")) return "9x16";
    if (lower.includes("4x5") || lower.includes("4_5")) return "4x5";
    if (lower.includes("1x1") || lower.includes("1_1")) return "1x1";
    if (lower.includes("16x9") || lower.includes("16_9")) return "16x9";
    return "other";
  };

  const getPrefix = (filename: string): string => {
    const name = filename.replace(/\.[^/.]+$/, "");
    return name.replace(/[_-]?(9x16|9_16|4x5|4_5|1x1|1_1|16x9|16_9)$/i, "").trim();
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
    });
  };

  const getVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadeddata = () => {
        video.currentTime = 1;
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        resolve(canvas.toDataURL("image/jpeg"));
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => resolve("");
      video.src = URL.createObjectURL(file);
    });
  };

  // Handle file upload
  const handleFiles = useCallback(
    async (files: FileList) => {
      const newMedia: MediaFile[] = [];

      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");

        if (!isVideo && !isImage) continue;

        const base64 = await fileToBase64(file);
        const preview = isVideo ? await getVideoThumbnail(file) : URL.createObjectURL(file);

        newMedia.push({
          id: generateId(),
          file,
          preview,
          name: file.name,
          aspectRatio: getAspectRatio(file.name),
          base64,
          type: isVideo ? "video" : "image",
        });
      }

      // Group by prefix
      const groupsMap = new Map<string, MediaFile[]>();
      newMedia.forEach((m) => {
        const prefix = getPrefix(m.name);
        if (!groupsMap.has(prefix)) groupsMap.set(prefix, []);
        groupsMap.get(prefix)!.push(m);
      });

      // Create ad groups
      const newGroups: AdGroup[] = Array.from(groupsMap.entries()).map(([prefix, media]) => ({
        id: generateId(),
        prefix,
        media,
        adName: prefix,
        primaryText: templateData.primaryText,
        headline: templateData.headline,
        url: templateData.url,
        status: "idle",
      }));

      setPool((prev) => [...prev, ...newGroups]);
      toast.success(`Added ${newGroups.length} ad group(s)`);
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
    let adIndex = 0;

    for (let i = 0; i < actualNumAdSets; i++) {
      const containerAds: AdGroup[] = [];
      for (let j = 0; j < adsPerAdSet && adIndex < totalAds; j++) {
        containerAds.push(pool[adIndex]);
        adIndex++;
      }

      newContainers.push({
        id: generateId(),
        name: `Ad Set ${adSetContainers.length + i + 1}`,
        adGroups: containerAds,
        status: "idle",
      });
    }

    const remainingAds = pool.slice(adIndex);

    setAdSetContainers((prev) => [...prev, ...newContainers]);
    setPool(remainingAds);

    toast.success(`Created ${newContainers.length} Ad Set(s)`);
  };

  // Add empty container
  const addEmptyContainer = () => {
    setAdSetContainers((prev) => [
      ...prev,
      {
        id: generateId(),
        name: `Ad Set ${prev.length + 1}`,
        adGroups: [],
        status: "idle",
      },
    ]);
  };

  // Update container name
  const updateContainerName = (containerId: string, name: string) => {
    setAdSetContainers((prev) => prev.map((c) => (c.id === containerId ? { ...c, name } : c)));
  };

  // Remove container
  const removeContainer = (containerId: string) => {
    const container = adSetContainers.find((c) => c.id === containerId);
    if (container) {
      setPool((prev) => [...prev, ...container.adGroups]);
    }
    setAdSetContainers((prev) => prev.filter((c) => c.id !== containerId));
  };

  // Update ad group in pool
  const updatePoolGroup = (groupId: string, field: keyof AdGroup, value: string) => {
    setPool((prev) => prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g)));
  };

  // Update ad group in container
  const updateContainerGroup = (containerId: string, groupId: string, field: keyof AdGroup, value: string) => {
    setAdSetContainers((prev) =>
      prev.map((c) =>
        c.id === containerId ? { ...c, adGroups: c.adGroups.map((g) => (g.id === groupId ? { ...g, [field]: value } : g)) } : c
      )
    );
  };

  // Remove ad group from pool
  const removePoolGroup = (groupId: string) => {
    setPool((prev) => prev.filter((g) => g.id !== groupId));
  };

  // Remove ad group from container
  const removeContainerGroup = (containerId: string, groupId: string) => {
    setAdSetContainers((prev) =>
      prev.map((c) => (c.id === containerId ? { ...c, adGroups: c.adGroups.filter((g) => g.id !== groupId) } : c))
    );
  };

  // Get scheduled time in ISO format (Europe/Bucharest timezone)
  const getScheduledTime = (): string | undefined => {
    if (!scheduleEnabled || !scheduleDate || !scheduleTime) return undefined;
    // Create date in Bucharest timezone
    const dateTimeStr = `${scheduleDate}T${scheduleTime}:00`;
    const date = new Date(dateTimeStr);
    // Adjust for Bucharest timezone (UTC+2 or UTC+3 depending on DST)
    return date.toISOString();
  };

  // Create all ads
  const handleCreateAll = async () => {
    if (!fbAccessToken || !selectedAd) {
      toast.error("Please connect Facebook and select a template");
      return;
    }

    const containersToCreate = adSetContainers.filter((c) => c.adGroups.length > 0 && c.status !== "success");
    if (containersToCreate.length === 0) {
      toast.error("No Ad Sets with ads to create");
      return;
    }

    setIsCreating(true);

    for (const container of containersToCreate) {
      setAdSetContainers((prev) =>
        prev.map((c) =>
          c.id === container.id
            ? { ...c, status: "creating", adGroups: c.adGroups.map((g) => ({ ...g, status: "creating" })) }
            : c
        )
      );

      try {
        const result = await batchCreateAdsMutation.mutateAsync({
          accessToken: fbAccessToken,
          templateAdId: selectedAd,
          newAdSetName: container.name,
          scheduledTime: getScheduledTime(),
          ads: container.adGroups.map((g) => ({
            adName: g.adName,
            primaryText: g.primaryText,
            headline: g.headline,
            url: g.url,
            media: g.media.map((m) => ({
              filename: m.name,
              aspectRatio: m.aspectRatio,
              base64: m.base64,
              type: m.type,
            })),
          })),
        });

        setAdSetContainers((prev) =>
          prev.map((c) => {
            if (c.id !== container.id) return c;

            const updatedGroups = c.adGroups.map((g) => {
              const res = result.results.find((r) => r.adName === g.adName);
              if (res?.success) {
                return { ...g, status: "success" as const, adId: res.adId };
              } else {
                return { ...g, status: "error" as const, errorMessage: res?.error || "Unknown error" };
              }
            });

            const allSuccess = updatedGroups.every((g) => g.status === "success");
            const hasError = updatedGroups.some((g) => g.status === "error");

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
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Connected
                </span>
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
          {/* Step 1: Template Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
                  1
                </span>
                Select Template Ad
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <Select
                value={selectedCampaign}
                onValueChange={(v) => {
                  setSelectedCampaign(v);
                  setSelectedAdSet("");
                  setSelectedAd("");
                }}
                disabled={!fbConnected}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Campaign..." />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedAdSet}
                onValueChange={(v) => {
                  setSelectedAdSet(v);
                  setSelectedAd("");
                }}
                disabled={!selectedCampaign}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Ad Set..." />
                </SelectTrigger>
                <SelectContent>
                  {adSets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedAd} onValueChange={setSelectedAd} disabled={!selectedAdSet}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Ad..." />
                </SelectTrigger>
                <SelectContent>
                  {ads.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <div
                id="pool-drop-zone"
                className="min-h-[150px] border-2 border-dashed rounded-lg p-3 transition-all"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
                }}
              >
                {pool.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
                    onClick={() => document.getElementById("file-upload")?.click()}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      <Film className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Drop images & videos here</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Name files like: product_9x16.jpg, product_4x5.mp4
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <SortableContext items={pool.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                      {pool.map((group) => (
                        <DraggableAdGroup
                          key={group.id}
                          group={group}
                          onUpdate={(field, value) => updatePoolGroup(group.id, field, value)}
                          onRemove={() => removePoolGroup(group.id)}
                          disabled={false}
                        />
                      ))}
                    </SortableContext>
                    <div
                      className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => document.getElementById("file-upload")?.click()}
                    >
                      <span className="text-sm text-muted-foreground">+ Add more media</span>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  className="hidden"
                  id="file-upload"
                />
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
                  {/* Schedule Option */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="schedule-toggle"
                        checked={scheduleEnabled}
                        onChange={(e) => setScheduleEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="schedule-toggle" className="text-sm flex items-center gap-1 cursor-pointer">
                        <Clock className="h-4 w-4" />
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
