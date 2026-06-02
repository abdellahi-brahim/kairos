import { useState } from "react";
import { parseTags, serializeTags } from "../lib/tags";
import { TagChip } from "./TagChip";

interface TagEditorProps {
  value: string | null;
  onChange: (json: string | null) => void;
}

export function TagEditor({ value, onChange }: TagEditorProps) {
  const tags = parseTags(value);
  const [input, setInput] = useState("");

  const add = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange(serializeTags([...tags, t]));
    setInput("");
  };
  const remove = (t: string) =>
    onChange(serializeTags(tags.filter((x) => x !== t)));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <TagChip
          key={t}
          name={t}
          trailing={
            <button
              onClick={() => remove(t)}
              className="text-muted opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          }
        />
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
          if (e.key === "Backspace" && !input && tags.length) {
            remove(tags[tags.length - 1]);
          }
        }}
        placeholder="+ tag"
        className="w-16 bg-transparent text-[12px] outline-none placeholder-faint"
      />
    </div>
  );
}
