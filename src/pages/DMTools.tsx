import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, setDoc, doc } from 'firebase/firestore';
import { generateUniqueId } from '../utils/slugify';
import { Entity } from '../types';
import { useNavigate } from 'react-router-dom';
import { Dice5, Save, RefreshCw } from 'lucide-react';

const TAVERN_NAMES_1 = ['The Prancing', 'The Rusty', 'The Golden', 'The Sleeping', 'The Laughing', 'The Drunken', 'The Blind', 'The Black', 'The White', 'The Red'];
const TAVERN_NAMES_2 = ['Pony', 'Dragon', 'Lion', 'Giant', 'Goblin', 'Sailor', 'Boar', 'Stag', 'Griffin', 'Unicorn'];

const NPC_FIRST_NAMES = ['Aelar', 'Birel', 'Daen', 'Eldon', 'Fargrim', 'Gael', 'Himo', 'Ilyana', 'Jor', 'Kael', 'Lia', 'Morn', 'Naeris', 'Orsik', 'Paela', 'Quinn', 'Rolen', 'Silaqui', 'Thia', 'Uthal', 'Varis', 'Wrenn', 'Xander', 'Yestin', 'Zook'];
const NPC_LAST_NAMES = ['Amakiir', 'Battlehammer', 'Caskbone', 'Dungarth', 'Evenwood', 'Fireforge', 'Galanodel', 'High-hill', 'Ironfist', 'Liadon', 'Mellerelel', 'Nailo', 'Siannodel', 'Thorngage', 'Underbough'];
const NPC_QUIRKS = ['Always speaks in a whisper', 'Constantly flipping a coin', 'Has a very loud, booming laugh', 'Suspicious of magic users', 'Collects strange bugs', 'Forgets names instantly', 'Smells faintly of sulfur', 'Missing an eye', 'Always hungry', 'Overly polite'];

const LOOT_ITEMS = ['A glowing blue potion', 'A silver dagger with a ruby in the hilt', 'A leather pouch containing 50gp', 'A map leading to a nearby cave', 'A ring that feels warm to the touch', 'A finely crafted elven bow', 'A spell scroll of Fireball', 'A set of loaded dice', 'A small wooden carving of a bear', 'A mysterious locked iron box'];

export default function DMTools() {
  const { isDM, currentCampaign, user } = useAuth();
  const navigate = useNavigate();
  
  const [generatedTavern, setGeneratedTavern] = useState('');
  const [generatedNPC, setGeneratedNPC] = useState({ name: '', quirk: '' });
  const [generatedLoot, setGeneratedLoot] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isDM || !currentCampaign || !user) {
    return <div className="text-stone-400">You must be a DM to access these tools.</div>;
  }

  const generateTavern = () => {
    const p1 = TAVERN_NAMES_1[Math.floor(Math.random() * TAVERN_NAMES_1.length)];
    const p2 = TAVERN_NAMES_2[Math.floor(Math.random() * TAVERN_NAMES_2.length)];
    setGeneratedTavern(`${p1} ${p2}`);
  };

  const generateNPC = () => {
    const first = NPC_FIRST_NAMES[Math.floor(Math.random() * NPC_FIRST_NAMES.length)];
    const last = NPC_LAST_NAMES[Math.floor(Math.random() * NPC_LAST_NAMES.length)];
    const quirk = NPC_QUIRKS[Math.floor(Math.random() * NPC_QUIRKS.length)];
    setGeneratedNPC({ name: `${first} ${last}`, quirk });
  };

  const generateLoot = () => {
    const loot = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
    setGeneratedLoot(loot);
  };

  const saveTavern = async () => {
    if (!generatedTavern) return;
    setSaving(true);
    try {
      const id = await generateUniqueId(generatedTavern);
      const entity: Entity = {
        id,
        campaignId: currentCampaign.id,
        type: 'shop',
        name: generatedTavern,
        content: `A tavern generated on the fly.`,
        tags: ['tavern', 'generated'],
        ownerId: user.uid,
        isPublic: false,
        allowedPlayers: [],
        attributes: { storeType: 'Tavern' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'entities', id), entity);
      navigate(`/entity/${id}/edit`);
    } finally {
      setSaving(false);
    }
  };

  const saveNPC = async () => {
    if (!generatedNPC.name) return;
    setSaving(true);
    try {
      const id = await generateUniqueId(generatedNPC.name);
      const entity: Entity = {
        id,
        campaignId: currentCampaign.id,
        type: 'npc',
        name: generatedNPC.name,
        content: `**Quirk:** ${generatedNPC.quirk}`,
        tags: ['npc', 'generated'],
        ownerId: user.uid,
        isPublic: false,
        allowedPlayers: [],
        attributes: { specifics: generatedNPC.quirk },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'entities', id), entity);
      navigate(`/entity/${id}/edit`);
    } finally {
      setSaving(false);
    }
  };

  const saveLoot = async () => {
    if (!generatedLoot) return;
    setSaving(true);
    try {
      const id = await generateUniqueId('Random Loot');
      const entity: Entity = {
        id,
        campaignId: currentCampaign.id,
        type: 'item',
        name: 'Random Loot',
        content: generatedLoot,
        tags: ['loot', 'generated'],
        ownerId: user.uid,
        isPublic: false,
        allowedPlayers: [],
        attributes: { itemCategory: 'Other' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'entities', id), entity);
      navigate(`/entity/${id}/edit`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3 mb-8">
        <Dice5 className="text-amber-500" size={32} />
        <h1 className="text-3xl font-bold text-stone-100 font-cinzel tracking-wider">DM Tools & Generators</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tavern Generator */}
        <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-amber-500 mb-4 font-cinzel">Random Tavern</h2>
          <div className="flex gap-2 mb-4">
            <button onClick={generateTavern} className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-medium transition-all">
              <RefreshCw size={18} /> Generate
            </button>
            {generatedTavern && (
              <button onClick={saveTavern} disabled={saving} className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-all disabled:opacity-50">
                <Save size={18} /> Save
              </button>
            )}
          </div>
          {generatedTavern && (
            <div className="p-4 bg-stone-950 rounded-xl border border-stone-800 text-center">
              <p className="text-2xl font-bold text-stone-100 font-cinzel">{generatedTavern}</p>
            </div>
          )}
        </div>

        {/* NPC Generator */}
        <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-amber-500 mb-4 font-cinzel">Random NPC</h2>
          <div className="flex gap-2 mb-4">
            <button onClick={generateNPC} className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-medium transition-all">
              <RefreshCw size={18} /> Generate
            </button>
            {generatedNPC.name && (
              <button onClick={saveNPC} disabled={saving} className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-all disabled:opacity-50">
                <Save size={18} /> Save
              </button>
            )}
          </div>
          {generatedNPC.name && (
            <div className="p-4 bg-stone-950 rounded-xl border border-stone-800 text-center space-y-2">
              <p className="text-2xl font-bold text-stone-100 font-cinzel">{generatedNPC.name}</p>
              <p className="text-sm text-stone-400 italic">"{generatedNPC.quirk}"</p>
            </div>
          )}
        </div>

        {/* Loot Generator */}
        <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-6 shadow-xl md:col-span-2">
          <h2 className="text-xl font-bold text-amber-500 mb-4 font-cinzel">Random Loot / Discovery</h2>
          <div className="flex gap-2 mb-4">
            <button onClick={generateLoot} className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-medium transition-all">
              <RefreshCw size={18} /> Generate
            </button>
            {generatedLoot && (
              <button onClick={saveLoot} disabled={saving} className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-all disabled:opacity-50">
                <Save size={18} /> Save
              </button>
            )}
          </div>
          {generatedLoot && (
            <div className="p-4 bg-stone-950 rounded-xl border border-stone-800 text-center">
              <p className="text-lg text-stone-200">{generatedLoot}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
