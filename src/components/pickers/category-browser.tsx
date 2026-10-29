"use client";

import { categorySearchMatch } from "@/lib/domain/category-search";
import { useState } from 'react';
import { Check, Search, Utensils, ShoppingBasket, Car, Plane, ShoppingBag, Sparkles, House, HeartPulse, GraduationCap, Gift, Shapes, ChevronRight, type LucideIcon } from 'lucide-react';
import type { CategoryLookup } from '@/lib/domain/categories';
import { TextField } from '@/components/ui/fields';
import { cn } from '@/lib/utils';

const SECTIONS = [
  {label:'Everyday', ids:['dining','essentials','transport']},
  {label:'Home & lifestyle', ids:['bills','shopping','entertainment','travel']},
  {label:'Health & learning', ids:['health','education']},
  {label:'More categories', ids:['gifts','other','adjustment']},
];
const ICONS: Record<string, LucideIcon> = {dining:Utensils, essentials:ShoppingBasket, transport:Car, travel:Plane, shopping:ShoppingBag, entertainment:Sparkles, bills:House, health:HeartPulse, education:GraduationCap, gifts:Gift};
const TONES: Record<string,string> = {dining:'bg-orange-100 text-orange-800', essentials:'bg-emerald-100 text-emerald-800', transport:'bg-blue-100 text-blue-800', bills:'bg-amber-100 text-amber-800', health:'bg-rose-100 text-rose-800'};

/** Visual grouping only. All selections retain the user's existing category IDs. */
export function CategoryBrowser({categories, recentIds=[], value, onChange, className}: {
  categories:CategoryLookup; recentIds?:string[]; value?:string; onChange:(id:string)=>void; className?:string;
}) {
  const [query,setQuery]=useState('');
  const needle=query.trim().toLocaleLowerCase();
  const selected=categories.groupOf(value ?? "")?.id ?? value;
  const matches=categories.groups.filter(c=>[c,...categories.leavesOf(c.id)].some(row=>categorySearchMatch(row.id,row.name,needle)));
  const assigned=new Set(SECTIONS.flatMap(s=>s.ids));
  const sections=needle ? [{label:`Search results · ${matches.length}`, ids:matches.map(c=>c.id)}] : [
    ...SECTIONS,
    {label:'Your categories',ids:categories.groups.filter(c=>!assigned.has(c.id)).map(c=>c.id)},
  ];
  return <div className={cn('space-y-5',className)}>
    <TextField placeholder="Search categories or types" value={query} onChange={e=>setQuery(e.target.value)} prefix={<Search className="h-4 w-4" aria-hidden="true" />} aria-label="Search categories" />
    {!needle && recentIds.length>0 && <div>
      <p className="mb-2 text-xs font-medium text-ink-secondary">Recently used</p>
      <div className="flex flex-wrap gap-2">{recentIds.filter(id=>categories.groups.some(c=>c.id===id)).map(id=><button type="button" key={id} onClick={()=>onChange(id)} aria-pressed={selected===id} className="min-h-11 rounded-full border border-line px-3 text-sm text-ink hover:bg-surface-hover">{categories.nameOf(id)}</button>)}</div>
    </div>}
    {sections.map(section=>{
      const rows=section.ids.map(id=>categories.groups.find(c=>c.id===id)).filter(c=>!!c);
      if(!rows.length)return null;
      return <section key={section.label} aria-label={section.label}>
        <h3 className="mb-2 text-xs font-semibold text-ink-secondary">{section.label}</h3>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{rows.map(category=>{
          const Icon=ICONS[category.id]??Shapes;
          const children=categories.leavesOf(category.id).filter(c=>!needle||categorySearchMatch(category.id,category.name,needle)||categorySearchMatch(c.id,c.name,needle));
          return <button key={category.id} type="button" onClick={()=>onChange(category.id)} aria-pressed={selected===category.id} className={cn('flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]', selected===category.id&&'bg-surface-sunken')}>
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full',TONES[category.id]??'bg-violet-100 text-violet-800')}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-ink">{category.name}</span>{children.length>0&&<span className="mt-0.5 block truncate text-xs text-ink-secondary">{children.slice(0,3).map(c=>c.name).join(' · ')}{children.length>3?'…':''}</span>}</span>
            {selected===category.id?<Check className="h-4 w-4 shrink-0" aria-label="Selected" />:<ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden="true" />}
          </button>;
        })}</div>
      </section>;
    })}
    {matches.length===0&&<p role="status" className="py-4 text-center text-sm text-ink-secondary">No categories match “{query}”. <button type="button" className="underline" onClick={()=>setQuery('')}>Clear search</button></p>}
  </div>;
}
