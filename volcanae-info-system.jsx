import { useState } from "react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const UNIT_DESCRIPTIONS = {
  INFANTRY:   "Versatile foot soldier that can move, fight, build structures, and capture enemy buildings.",
  ARCHER:     "Ranged attacker that strikes from 2 tiles away without stepping into melee range.",
  RIDER:      "Swift cavalry that covers 2 tiles per move to outflank and pressure the enemy.",
  SIEGE:      "Long-range bombard with 3-tile reach; must prepare one turn before it can fire.",
  SCOUT:      "Lightly armored explorer that reveals more fog of war than any other unit.",
  GUARD:      "Heavily armored defender with high defense, best used to hold key buildings.",
  EMBERLING:  "Fragile fire spirit that explodes on death, dealing heavy damage to everything nearby.",
};

const UNIT_STATS = {
  INFANTRY:  { atk:50, def:50, mov:1, rng:1, vis:1 },
  ARCHER:    { atk:50, def:20, mov:1, rng:2, vis:1 },
  RIDER:     { atk:70, def:40, mov:2, rng:1, vis:1 },
  SIEGE:     { atk:85, def:0,  mov:1, rng:3, vis:1 },
  SCOUT:     { atk:30, def:20, mov:2, rng:1, vis:2 },
  GUARD:     { atk:15, def:75, mov:1, rng:1, vis:1 },
  EMBERLING: { atk:15, def:10, mov:2, rng:1, vis:1 },
};

const UNIT_TAGS = {
  INFANTRY:  ["BUILDANDCAPTURE"],
  ARCHER:    ["RANGED", "BUILDANDCAPTURE"],
  RIDER:     ["BUILDANDCAPTURE"],
  SIEGE:     ["RANGED", "PREP"],
  SCOUT:     [],
  GUARD:     ["PREP"],
  EMBERLING: ["SACRIFICIAL", "EXPLOSIVE"],
};

const TAG_INFO = {
  RANGED:         { label: "Ranged",          desc: "Attacks from a distance; cannot retaliate when struck by an adjacent attacker." },
  PREP:           { label: "Prep",            desc: "Must spend one turn in a prepared state before it can attack." },
  BUILDANDCAPTURE:{ label: "Build & Capture", desc: "Can construct buildings on open terrain and capture enemy strongholds." },
  SACRIFICIAL:    { label: "Sacrificial",     desc: "Destroyed after it performs its special action." },
  EXPLOSIVE:      { label: "Explosive",       desc: "Deals heavy area damage to all adjacent units when it dies." },
  FIELDWORK:      { label: "Fieldwork",       desc: "Can sacrifice itself on its current tile to instantly erect a Watchtower." },
  ASSASSIN:       { label: "Assassin",        desc: "Deals bonus damage when striking an enemy that is still at full health." },
  PATCHUP:        { label: "Patch Up",        desc: "Can spend its action to restore health on one adjacent friendly unit." },
  LAVABOOST:      { label: "Lava-Boosted",    desc: "Gains combat bonuses when fighting near the advancing lava front." },
};

const BUILDING_DESCRIPTIONS = {
  STRONGHOLD:      "Your capital — if the enemy captures all five strongholds, you lose.",
  MINE:            "Produces iron every turn, the primary resource for training units.",
  WOODCUTTER:      "Produces wood every turn, used alongside iron for buildings and recruitment.",
  BARRACKS:        "Military hall that trains Infantry.",
  ARCHER_CAMP:     "Archery range that trains Archers.",
  RIDER_CAMP:      "Stable that trains Riders.",
  SIEGE_CAMP:      "Engineering works that trains Siege engines.",
  WATCHTOWER:      "Unmanned tower that passively expands your vision into the fog.",
  FARM:            "Housing for common folk — each pop raised lets you field one more basic unit.",
  PATRICIANHOUSE:  "Noble estate — each noble raised lets you field one more elite unit.",
  CRYSTAL_CHAMBER: "Arcane resonator that generates crystals used to unlock new technologies.",
};

// ─── Shared Popup Shell ───────────────────────────────────────────────────────

function Popup({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.6)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#141418", border:"1px solid rgba(255,140,40,0.3)", borderRadius:14, padding:"22px 24px", maxWidth:300, width:"92%", boxShadow:"0 8px 48px rgba(0,0,0,0.9)", animation:"popIn 0.17s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Tag Popup ────────────────────────────────────────────────────────────────

function TagPopup({ tag, onClose }) {
  const info = TAG_INFO[tag];
  if (!info) return null;
  return (
    <Popup onClose={onClose}>
      <div style={{ fontWeight:700, color:"#f0c870", fontSize:14, marginBottom:10, fontFamily:"Georgia,serif" }}>{info.label}</div>
      <p style={{ margin:"0 0 16px", fontSize:13, color:"#c8b898", lineHeight:1.65, fontFamily:"Georgia,serif" }}>{info.desc}</p>
      <Btn onClick={onClose} variant="secondary">OK</Btn>
    </Popup>
  );
}

// ─── Unit Info Popup ──────────────────────────────────────────────────────────
// Shows description, stats, and tappable tag pills

function UnitInfoPopup({ unitKey, name, emoji, onClose }) {
  const [tagPopup, setTagPopup] = useState(null);
  const desc  = UNIT_DESCRIPTIONS[unitKey];
  const stats = UNIT_STATS[unitKey];
  const tags  = UNIT_TAGS[unitKey] ?? [];

  return (
    <>
      <Popup onClose={onClose}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <span style={{ fontSize:26 }}>{emoji}</span>
          <span style={{ fontWeight:700, fontSize:16, color:"#f0c870", fontFamily:"Georgia,serif" }}>{name}</span>
        </div>

        {/* Description */}
        <p style={{ margin:"0 0 14px", fontSize:12, color:"#c8b898", lineHeight:1.65, fontFamily:"Georgia,serif" }}>{desc}</p>

        {/* Stats */}
        {stats && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"2px 0", marginBottom:14, background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"10px 6px" }}>
            {[["ATK",stats.atk],["DEF",stats.def],["MOV",stats.mov],["RNG",stats.rng],["VIS",stats.vis]].map(([l,v]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:9, color:"#888", letterSpacing:"0.06em" }}>{l}</div>
                <div style={{ fontSize:15, color:"#eee", fontWeight:700 }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tag pills — tappable */}
        {tags.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
            {tags.map(tag => (
              <button key={tag} onClick={() => setTagPopup(tag)} style={{ fontSize:11, color:"#f0d080", background:"rgba(240,180,40,0.12)", border:"1px solid rgba(240,180,40,0.35)", borderRadius:20, padding:"3px 10px", cursor:"pointer", fontFamily:"Georgia,serif", display:"flex", alignItems:"center", gap:4 }}>
                {TAG_INFO[tag]?.label ?? tag}
                <span style={{ fontSize:9, color:"rgba(240,180,40,0.6)", fontFamily:"sans-serif" }}>i</span>
              </button>
            ))}
          </div>
        )}

        <Btn onClick={onClose} variant="secondary">OK</Btn>
      </Popup>

      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </>
  );
}

// ─── Building Info + Construct Popup ─────────────────────────────────────────
// Flow: tap construct option → this popup → user chooses Construct or Back

function BuildingInfoPopup({ buildingKey, name, emoji, cost, onConstruct, onClose }) {
  const desc = BUILDING_DESCRIPTIONS[buildingKey];
  return (
    <Popup onClose={onClose}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <span style={{ fontSize:26 }}>{emoji}</span>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:"#f0c870", fontFamily:"Georgia,serif" }}>{name}</div>
          <div style={{ fontSize:11, color:"#f0a840" }}>⛓️{cost.iron} 🪵{cost.wood}</div>
        </div>
      </div>
      <p style={{ margin:"0 0 18px", fontSize:12, color:"#c8b898", lineHeight:1.65, fontFamily:"Georgia,serif" }}>{desc}</p>
      <div style={{ display:"flex", gap:10 }}>
        <Btn onClick={onClose} variant="secondary" flex>Back</Btn>
        <Btn onClick={onConstruct} variant="primary" flex>Construct</Btn>
      </div>
    </Popup>
  );
}

// ─── Shared Button ────────────────────────────────────────────────────────────

function Btn({ onClick, variant, children, flex }) {
  const isPrimary = variant === "primary";
  return (
    <button onClick={onClick} style={{ flex: flex ? 1 : undefined, padding:"9px 0", background: isPrimary ? "rgba(255,140,40,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${isPrimary ? "rgba(255,140,40,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:8, color: isPrimary ? "#f0c060" : "#aaa", cursor:"pointer", fontSize:13, fontFamily:"Georgia,serif", fontWeight: isPrimary ? 700 : 400 }}>
      {children}
    </button>
  );
}

// ─── Demo: Unit Panel ─────────────────────────────────────────────────────────
// The entire panel header row is tappable (Polytopia pattern)

function UnitPanelDemo() {
  const [infoOpen, setInfoOpen] = useState(false);
  const [tagPopup, setTagPopup] = useState(null);
  const unit = { key:"ARCHER", name:"Archer", emoji:"🏹" };
  const stats = UNIT_STATS[unit.key];
  const tags  = UNIT_TAGS[unit.key];

  return (
    <div>
      <div style={{ fontSize:11, color:"#666", marginBottom:10, fontStyle:"italic" }}>
        Tapping anywhere on the header row (name + ⓘ) opens the full unit info.
      </div>
      <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", maxWidth:340, display:"flex", flexDirection:"column", gap:6 }}>

        {/* Header — entire row is tappable */}
        <button onClick={() => setInfoOpen(true)} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"#eee", cursor:"pointer", padding:0, textAlign:"left", width:"100%", borderRadius:6 }}>
          <span style={{ fontSize:20 }}>🏹</span>
          <span style={{ fontWeight:700, fontSize:14, fontFamily:"Georgia,serif" }}>Archer</span>
          <span style={{ fontSize:9, color:"rgba(255,160,60,0.6)", fontFamily:"sans-serif", background:"rgba(255,160,60,0.1)", border:"1px solid rgba(255,160,60,0.3)", borderRadius:"50%", width:16, height:16, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>i</span>
          <span style={{ marginLeft:"auto", fontSize:11, color:"#4af", background:"rgba(40,120,255,0.15)", borderRadius:4, padding:"2px 7px" }}>🔵 Player</span>
        </button>

        {/* HP bar */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ flex:1, height:7, background:"rgba(255,255,255,0.1)", borderRadius:4, overflow:"hidden" }}>
            <div style={{ width:"65%", height:"100%", background:"#4ac950", borderRadius:4 }} />
          </div>
          <span style={{ fontSize:11, color:"#888" }}>65/100</span>
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"2px 0" }}>
          {[["ATK",stats.atk],["DEF",stats.def],["MOV",stats.mov],["RNG",stats.rng],["VIS",stats.vis]].map(([l,v]) => (
            <div key={l} style={{ textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#777" }}>{l}</div>
              <div style={{ fontSize:12, color:"#eee", fontWeight:600 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Tags — tappable */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
          {tags.map(tag => (
            <button key={tag} onClick={() => setTagPopup(tag)} style={{ fontSize:10, color:"#f0d080", background:"rgba(240,180,40,0.1)", border:"1px solid rgba(240,180,40,0.3)", borderRadius:20, padding:"2px 9px", cursor:"pointer", fontFamily:"Georgia,serif", display:"flex", alignItems:"center", gap:3 }}>
              {TAG_INFO[tag]?.label ?? tag}
              <span style={{ fontSize:8, color:"rgba(240,180,40,0.5)", fontFamily:"sans-serif" }}>i</span>
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:5 }}>
          {["Move","Attack","Capture"].map(a => <span key={a} style={{ fontSize:10, color:"#4af", background:"rgba(40,120,255,0.12)", border:"1px solid rgba(40,120,255,0.3)", borderRadius:4, padding:"2px 7px" }}>{a}</span>)}
        </div>
      </div>

      {infoOpen && <UnitInfoPopup unitKey={unit.key} name={unit.name} emoji={unit.emoji} onClose={() => setInfoOpen(false)} />}
      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </div>
  );
}

// ─── Unit Info + Recruit Popup ────────────────────────────────────────────────
// Same flow as construction: tap option → popup → Recruit or Back

function UnitRecruitPopup({ unit, onRecruit, onClose }) {
  const [tagPopup, setTagPopup] = useState(null);
  const desc  = UNIT_DESCRIPTIONS[unit.key];
  const stats = UNIT_STATS[unit.key];
  const tags  = UNIT_TAGS[unit.key] ?? [];
  return (
    <>
      <Popup onClose={onClose}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <span style={{ fontSize:26 }}>{unit.emoji}</span>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#f0c870", fontFamily:"Georgia,serif" }}>{unit.name}</div>
            <div style={{ fontSize:11, color:"#f0a840" }}>{unit.cost}</div>
          </div>
        </div>
        <p style={{ margin:"0 0 14px", fontSize:12, color:"#c8b898", lineHeight:1.65, fontFamily:"Georgia,serif" }}>{desc}</p>
        {stats && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"2px 0", marginBottom:14, background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"10px 6px" }}>
            {[["ATK",stats.atk],["DEF",stats.def],["MOV",stats.mov],["RNG",stats.rng],["VIS",stats.vis]].map(([l,v]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:9, color:"#888", letterSpacing:"0.06em" }}>{l}</div>
                <div style={{ fontSize:15, color:"#eee", fontWeight:700 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
            {tags.map(tag => (
              <button key={tag} onClick={() => setTagPopup(tag)} style={{ fontSize:11, color:"#f0d080", background:"rgba(240,180,40,0.12)", border:"1px solid rgba(240,180,40,0.35)", borderRadius:20, padding:"3px 10px", cursor:"pointer", fontFamily:"Georgia,serif", display:"flex", alignItems:"center", gap:4 }}>
                {TAG_INFO[tag]?.label ?? tag}
                <span style={{ fontSize:9, color:"rgba(240,180,40,0.6)", fontFamily:"sans-serif" }}>i</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={onClose} variant="secondary" flex>Back</Btn>
          <Btn onClick={onRecruit} variant="primary" flex>Recruit</Btn>
        </div>
      </Popup>
      {tagPopup && <TagPopup tag={tagPopup} onClose={() => setTagPopup(null)} />}
    </>
  );
}

// ─── Demo: Recruit Panel ──────────────────────────────────────────────────────
// Tap entire row → unit info popup with Recruit / Back (mirrors construction flow)

function RecruitDemo() {
  const [confirmUnit, setConfirmUnit] = useState(null);
  const [recruited, setRecruited] = useState(null);
  const units = [
    { key:"SCOUT", name:"Scout", emoji:"🔭", cost:"⛓️2 🪵1" },
    { key:"GUARD", name:"Guard", emoji:"🛡️", cost:"⛓️3 🪵2" },
  ];
  return (
    <div>
      <div style={{ fontSize:11, color:"#666", marginBottom:10, fontStyle:"italic" }}>
        Tapping a unit row opens an info popup. Recruitment is confirmed inside the popup — same flow as construction.
      </div>
      <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", maxWidth:340, display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ fontWeight:700, fontSize:14, fontFamily:"Georgia,serif" }}>🏰 Stronghold <span style={{ fontSize:11, color:"#4af", fontWeight:400 }}>🔵 Player</span></div>
        <div style={{ fontSize:11, color:"#888" }}>Recruit:</div>
        {recruited ? (
          <div style={{ color:"#7ef0a0", fontSize:13, padding:"8px 0", fontFamily:"Georgia,serif" }}>✓ {recruited} recruited!</div>
        ) : (
          units.map(u => (
            <button key={u.key} onClick={() => setConfirmUnit(u)} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, padding:"9px 12px", color:"#eee", cursor:"pointer", textAlign:"left", width:"100%" }}>
              <span style={{ fontSize:18 }}>{u.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontFamily:"Georgia,serif", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                  {u.name}
                  <span style={{ fontSize:8, color:"rgba(255,160,60,0.5)", fontFamily:"sans-serif", background:"rgba(255,160,60,0.1)", border:"1px solid rgba(255,160,60,0.3)", borderRadius:"50%", width:13, height:13, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>i</span>
                </div>
                <div style={{ fontSize:10, color:"#f0a840" }}>{u.cost}</div>
              </div>
            </button>
          ))
        )}
      </div>
      {confirmUnit && (
        <UnitRecruitPopup
          unit={confirmUnit}
          onRecruit={() => { setRecruited(confirmUnit.name); setConfirmUnit(null); }}
          onClose={() => setConfirmUnit(null)}
        />
      )}
    </div>
  );
}

// ─── Demo: Construction Panel ─────────────────────────────────────────────────
// Tap option → building info popup with Construct / Back

function ConstructDemo() {
  const [confirmBuilding, setConfirmBuilding] = useState(null);
  const [built, setBuilt] = useState(null);

  const options = [
    { key:"MINE",      name:"Mine",       emoji:"🏔️", cost:{ iron:2, wood:1 } },
    { key:"WOODCUTTER",name:"Woodcutter", emoji:"🛖", cost:{ iron:1, wood:2 } },
    { key:"WATCHTOWER",name:"Watchtower", emoji:"👁️", cost:{ iron:2, wood:2 } },
  ];

  return (
    <div>
      <div style={{ fontSize:11, color:"#666", marginBottom:10, fontStyle:"italic" }}>
        Tapping a construction option opens a building info popup. Construct is a second confirmation step.
      </div>
      <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", maxWidth:340, display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ fontWeight:700, fontSize:13, color:"#aaa", marginBottom:2 }}>🔨 Construct Building</div>
        {built ? (
          <div style={{ color:"#7ef0a0", fontSize:13, padding:"8px 0", fontFamily:"Georgia,serif" }}>✓ {built} constructed!</div>
        ) : (
          options.map(opt => (
            <button key={opt.key} onClick={() => setConfirmBuilding(opt)} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, padding:"9px 12px", color:"#eee", cursor:"pointer", textAlign:"left" }}>
              <span style={{ fontSize:18 }}>{opt.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontFamily:"Georgia,serif", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
                  {opt.name}
                  <span style={{ fontSize:8, color:"rgba(255,160,60,0.5)", fontFamily:"sans-serif", background:"rgba(255,160,60,0.1)", border:"1px solid rgba(255,160,60,0.3)", borderRadius:"50%", width:13, height:13, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>i</span>
                </div>
                <div style={{ fontSize:10, color:"#f0a840" }}>⛓️{opt.cost.iron} 🪵{opt.cost.wood}</div>
              </div>
            </button>
          ))
        )}
      </div>

      {confirmBuilding && (
        <BuildingInfoPopup
          buildingKey={confirmBuilding.key}
          name={confirmBuilding.name}
          emoji={confirmBuilding.emoji}
          cost={confirmBuilding.cost}
          onConstruct={() => { setBuilt(confirmBuilding.name); setConfirmBuilding(null); }}
          onClose={() => setConfirmBuilding(null)}
        />
      )}
    </div>
  );
}

// ─── Demo: Tech Detail ────────────────────────────────────────────────────────
// Tech name has no ⓘ. The unlocked units listed inside DO have ⓘ.

function TechDetailDemo() {
  const [infoUnit, setInfoUnit] = useState(null);
  const unlocks = [
    { key:"RIDER", name:"Rider", emoji:"🐴" },
  ];
  return (
    <div>
      <div style={{ fontSize:11, color:"#666", marginBottom:10, fontStyle:"italic" }}>
        The tech name has no ⓘ. The unlocked items inside the detail panel do.
      </div>
      <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"14px 16px", maxWidth:340, display:"flex", flexDirection:"column", gap:10 }}>
        {/* Tech title — no ⓘ */}
        <div style={{ fontWeight:700, fontSize:16, color:"#f0c870", fontFamily:"Georgia,serif" }}>A Noble Stead</div>
        <p style={{ margin:0, fontSize:12, color:"#c8b898", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
          Attract the upper class and field swift cavalry.
        </p>
        <div style={{ fontSize:11, color:"#888" }}>This tech will enable the following:</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
          {unlocks.map(u => (
            /* Entire unit tile is tappable */
            <button key={u.key} onClick={() => setInfoUnit(u)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px 14px", cursor:"pointer", color:"#eee", position:"relative" }}>
              <span style={{ fontSize:30 }}>{u.emoji}</span>
              <span style={{ fontSize:12, fontFamily:"Georgia,serif" }}>{u.name}</span>
              {/* ⓘ badge on the unit tile, not on the tech title */}
              <span style={{ position:"absolute", top:5, right:5, fontSize:8, color:"rgba(255,160,60,0.7)", fontFamily:"sans-serif", background:"rgba(255,160,60,0.15)", border:"1px solid rgba(255,160,60,0.35)", borderRadius:"50%", width:14, height:14, display:"flex", alignItems:"center", justifyContent:"center" }}>i</span>
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="secondary" flex onClick={() => {}}>Back</Btn>
          <Btn variant="primary" flex onClick={() => {}}>Research (💎 2)</Btn>
        </div>
      </div>
      {infoUnit && <UnitInfoPopup unitKey={infoUnit.key} name={infoUnit.name} emoji={infoUnit.emoji} onClose={() => setInfoUnit(null)} />}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  ["unit",     "⚔️ Unit Panel"],
  ["recruit",  "🏰 Recruit"],
  ["construct","🔨 Construct"],
  ["tech",     "🔬 Tech Detail"],
];

export default function App() {
  const [tab, setTab] = useState("unit");
  return (
    <div style={{ minHeight:"100vh", background:"#0d0d12", fontFamily:"Georgia,serif", color:"#eee", display:"flex", flexDirection:"column", alignItems:"center" }}>
      <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.93)}to{opacity:1;transform:scale(1)}}*{box-sizing:border-box}`}</style>

      <div style={{ width:"100%", background:"rgba(255,100,20,0.08)", borderBottom:"1px solid rgba(255,100,20,0.2)", padding:"16px 24px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:24 }}>🌋</span>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"#f0a840" }}>VOLCANAE</div>
          <div style={{ fontSize:11, color:"#888", letterSpacing:"0.1em" }}>INFO SYSTEM · UX PROPOSAL v2</div>
        </div>
      </div>

      <div style={{ maxWidth:600, width:"100%", padding:"20px 16px" }}>

        {/* Rules summary */}
        <div style={{ background:"rgba(255,160,40,0.07)", border:"1px solid rgba(255,160,40,0.2)", borderRadius:10, padding:"14px 18px", marginBottom:22, fontSize:12, lineHeight:1.75, color:"#c8b898" }}>
          <div style={{ fontWeight:700, color:"#f0c060", fontSize:13, marginBottom:8 }}>Five rules (tap each tab to see them in action)</div>
          {[
            ["⓵ Tech detail","No ⓘ on the tech name. ⓘ appears on each unlocked item shown inside the detail panel."],
            ["⓶ Whole element","The entire recruit row / unit tile / header row is the tap target, not just the ⓘ icon."],
            ["⓷ Unit popup","Shows description + all stats + tappable tag pills."],
            ["⓸ Tag pills","Each tag pill is tappable and opens a popup describing what that tag does."],
            ["⓹ Recruit & Construct","Tap option → info popup with Back + action button. Nothing happens on first tap."],
          ].map(([t,d]) => (
            <div key={t} style={{ display:"flex", gap:8, marginBottom:6 }}>
              <span style={{ color:"#f0a840", minWidth:28, fontWeight:700 }}>{t}</span>
              <span style={{ color:"#999" }}>{d}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
          {TABS.map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding:"7px 13px", borderRadius:7, border:"1px solid", borderColor:tab===key?"rgba(255,140,40,0.7)":"rgba(255,255,255,0.1)", background:tab===key?"rgba(255,140,40,0.15)":"transparent", color:tab===key?"#f0c060":"#777", cursor:"pointer", fontSize:12, fontFamily:"Georgia,serif" }}>
              {label}
            </button>
          ))}
        </div>

        {tab==="unit"      && <UnitPanelDemo />}
        {tab==="recruit"   && <RecruitDemo />}
        {tab==="construct" && <ConstructDemo />}
        {tab==="tech"      && <TechDetailDemo />}
      </div>
    </div>
  );
}
