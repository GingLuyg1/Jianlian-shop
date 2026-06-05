"use client";

/**
 * ScrollingAnnouncement - Single-line marquee notice bar
 *
 * Displays the platform legal disclaimer in a scrolling marquee style.
 * Positioned below the PublicTopInfoBar on the homepage.
 * Uses CSS animation defined in globals.css (.animate-marquee).
 */

import { Megaphone } from "lucide-react";

interface ScrollingAnnouncementProps {
  text: string;
}

export default function ScrollingAnnouncement({
  text,
}: ScrollingAnnouncementProps) {
  return (
    <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5 mb-6">
      <div className="flex items-center gap-2.5">
        <Megaphone className="h-4 w-4 text-orange-600 shrink-0" />
        <div className="overflow-hidden flex-1 whitespace-nowrap">
          <span className="text-xs text-orange-700 animate-marquee inline-block">
            {text}
          </span>
        </div>
      </div>
    </div>
  );
}
