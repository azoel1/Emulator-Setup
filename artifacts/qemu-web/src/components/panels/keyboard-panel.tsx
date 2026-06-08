import React, { useState } from "react";
import { useSendKey, useTypeText, useSendText } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Keyboard as KeyboardIcon, Send, Type } from "lucide-react";

export function KeyboardPanel() {
  const sendKey = useSendKey();
  const typeText = useTypeText();
  const sendText = useSendText();

  const [customCombo, setCustomCombo] = useState("");
  const [textInput, setTextInput] = useState("");

  const handleCombo = (combo: string) => {
    sendKey.mutate({ data: { combo } });
  };

  const fKeys = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"];
  const combos = [
    { label: "Ctrl+Alt+Del", combo: "ctrl-alt-delete" },
    { label: "Win+R", combo: "meta-r" },
    { label: "Win+E", combo: "meta-e" },
    { label: "Win+D", combo: "meta-d" },
    { label: "Alt+Tab", combo: "alt-tab" },
    { label: "Alt+F4", combo: "alt-f4" },
    { label: "Ctrl+C", combo: "ctrl-c" },
    { label: "Ctrl+V", combo: "ctrl-v" },
    { label: "Enter", combo: "enter" },
    { label: "Esc", combo: "esc" },
  ];

  return (
    <div className="flex flex-col gap-5">

      {/* Function Keys */}
      <div>
        <Label className="text-primary font-bold uppercase tracking-wider text-[10px] mb-2 block border-b border-primary/20 pb-1">
          Function Keys
        </Label>
        <div className="grid grid-cols-6 gap-1.5">
          {fKeys.map(key => (
            <Button
              key={key}
              variant="outline"
              className="h-11 rounded-none border-primary/30 bg-black/40 hover:bg-primary hover:text-black active:bg-primary active:text-black text-xs font-mono touch-manipulation p-0"
              onClick={() => handleCombo(key)}
            >
              {key.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Common Combos */}
      <div>
        <Label className="text-primary font-bold uppercase tracking-wider text-[10px] mb-2 block border-b border-primary/20 pb-1">
          Shortcuts
        </Label>
        <div className="grid grid-cols-2 gap-1.5">
          {combos.map(c => (
            <Button
              key={c.combo}
              variant="outline"
              className="h-11 rounded-none border-primary/30 bg-black/40 hover:bg-primary hover:text-black active:bg-primary active:text-black font-mono text-[10px] touch-manipulation"
              onClick={() => handleCombo(c.combo)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Custom Combo */}
      <div>
        <Label className="text-primary font-bold uppercase tracking-wider text-[10px] mb-2 block border-b border-primary/20 pb-1">
          Custom Sequence
        </Label>
        <div className="flex gap-2">
          <Input
            value={customCombo}
            onChange={(e) => setCustomCombo(e.target.value)}
            placeholder="e.g. ctrl-shift-esc"
            className="rounded-none border-primary/30 bg-black/40 font-mono text-sm focus-visible:ring-primary h-11"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customCombo) {
                handleCombo(customCombo);
                setCustomCombo("");
              }
            }}
          />
          <Button
            variant="outline"
            className="rounded-none border-primary/50 hover:bg-primary hover:text-black active:bg-primary active:text-black h-11 w-11 shrink-0 touch-manipulation"
            onClick={() => {
              if (customCombo) {
                handleCombo(customCombo);
                setCustomCombo("");
              }
            }}
          >
            <KeyboardIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Text Injection */}
      <div>
        <Label className="text-primary font-bold uppercase tracking-wider text-[10px] mb-2 block border-b border-primary/20 pb-1">
          Text Injection
        </Label>
        <Textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Paste text to type into VM..."
          className="min-h-[80px] rounded-none border-primary/30 bg-black/40 font-mono text-sm resize-none focus-visible:ring-primary mb-2"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-none border-primary/50 hover:bg-primary hover:text-black active:bg-primary active:text-black touch-manipulation"
            onClick={() => {
              if (textInput) typeText.mutate({ data: { text: textInput } });
            }}
            disabled={!textInput || typeText.isPending}
          >
            <Type className="w-4 h-4 mr-1.5" />
            Type Only
          </Button>
          <Button
            className="h-11 rounded-none bg-primary text-black hover:bg-primary/80 active:bg-primary/60 touch-manipulation"
            onClick={() => {
              if (textInput) {
                sendText.mutate({ data: { text: textInput } });
                setTextInput("");
              }
            }}
            disabled={!textInput || sendText.isPending}
          >
            <Send className="w-4 h-4 mr-1.5" />
            Send+Enter
          </Button>
        </div>
      </div>

    </div>
  );
}
