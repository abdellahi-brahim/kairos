import { useState } from "react";

interface AddTaskProps {
  placeholder: string;
  onAdd: (title: string) => void;
}

export function AddTask({ placeholder, onAdd }: AddTaskProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    onAdd(title);
    setValue("");
  };

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") setValue("");
      }}
      placeholder={placeholder}
      className="w-full rounded border border-transparent bg-neutral-100 px-2 py-1 text-[12px] text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-300 focus:bg-white"
    />
  );
}
