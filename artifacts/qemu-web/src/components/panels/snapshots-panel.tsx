import React, { useState } from "react";
import { useListSnapshots, useCreateSnapshot, useRestoreSnapshot, useDeleteSnapshot, getListSnapshotsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Save, RotateCcw, Trash2, Camera, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export function SnapshotsPanel() {
  const queryClient = useQueryClient();
  const { data: snapshots, isLoading } = useListSnapshots({ query: { queryKey: getListSnapshotsQueryKey(), refetchInterval: 10000 } });
  const createSnap = useCreateSnapshot();
  const restoreSnap = useRestoreSnapshot();
  const deleteSnap = useDeleteSnapshot();

  const [newSnapName, setNewSnapName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = () => {
    if (!newSnapName) return;
    createSnap.mutate({ data: { name: newSnapName } }, {
      onSuccess: () => {
        setNewSnapName("");
        setIsCreating(false);
        queryClient.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
      }
    });
  };

  const handleRestore = (id: string) => {
    restoreSnap.mutate({ id }); // Assuming path param mapped correctly in client
  };

  const handleDelete = (id: string) => {
    deleteSnap.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Create Section */}
      <div className="p-3 border border-primary/20 bg-black/40">
        {!isCreating ? (
          <Button 
            className="w-full rounded-none border border-primary/50 hover:bg-primary hover:text-black transition-colors"
            variant="outline"
            onClick={() => setIsCreating(true)}
          >
            <Camera className="w-4 h-4 mr-2" />
            CAPTURE STATE
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Label className="text-primary font-bold uppercase tracking-wider text-[10px]">Snapshot Name</Label>
            <div className="flex gap-2">
              <Input 
                autoFocus
                value={newSnapName}
                onChange={(e) => setNewSnapName(e.target.value)}
                placeholder="e.g. Clean Install"
                className="rounded-none border-primary/30 bg-black h-8 text-sm focus-visible:ring-primary"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <Button 
                size="sm"
                className="rounded-none h-8 px-3 bg-primary text-black hover:bg-primary/80"
                onClick={handleCreate}
                disabled={!newSnapName || createSnap.isPending}
              >
                {createSnap.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </Button>
              <Button 
                size="sm"
                variant="outline"
                className="rounded-none h-8 px-2 border-primary/30"
                onClick={() => setIsCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* List Section */}
      <div className="flex flex-col gap-2">
        <Label className="text-primary font-bold uppercase tracking-wider text-xs border-b border-primary/20 pb-1">Saved States</Label>
        
        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary/50" /></div>
        ) : !snapshots || snapshots.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-primary/20 bg-black/20">
            <span className="text-muted-foreground font-mono text-sm">NO SNAPSHOTS FOUND</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
            {snapshots.map(snap => (
              <Card key={snap.id} className="rounded-none border-primary/30 bg-black/40 hover:bg-black/60 transition-colors">
                <CardContent className="p-3 flex items-center justify-between group">
                  <div className="flex flex-col overflow-hidden mr-2">
                    <span className="font-bold text-primary truncate text-sm">{snap.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(snap.createdAt), "yyyy-MM-dd HH:mm:ss")}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-7 w-7 rounded-none border-primary/50 hover:bg-primary hover:text-black"
                      onClick={() => handleRestore(snap.id)}
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-7 w-7 rounded-none border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
                      onClick={() => handleDelete(snap.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
