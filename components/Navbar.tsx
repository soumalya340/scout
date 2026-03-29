"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

export default function Navbar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 glass-nav py-5 transition-all duration-300"
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group" data-testid="navbar-logo">
          <div className="w-8 h-8 rounded-xl glass-strong flex items-center justify-center group-hover:scale-110 transition-transform">
            <Zap size={15} className="text-white" fill="white" />
          </div>
          <span className="font-display font-bold text-lg text-white tracking-tight">Scout</span>
        </Link>
      </div>
    </nav>
  );
}
