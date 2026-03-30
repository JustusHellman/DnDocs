import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, setDoc, doc } from 'firebase/firestore';
import { generateUniqueId } from '../utils/slugify';
import { Entity } from '../types';
import { useNavigate } from 'react-router-dom';
import { Dice5, Save, RefreshCw, Image as ImageIcon, Download, ShieldCheck, AlertCircle, List } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

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
  
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');

  // API Debugger State
  const [checkingApi, setCheckingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<{
    keyFound: boolean;
    textOk: boolean;
    textError?: string;
    models: string[];
    error?: string;
  } | null>(null);

  if (!isDM || !currentCampaign || !user) {
    return <div className="text-stone-400">You must be a DM to access these tools.</div>;
  }

  const checkApiStatus = async () => {
    setCheckingApi(true);
    setApiStatus(null);
    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setApiStatus({ keyFound: false, textOk: false, models: [], error: "No API Key found in environment." });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // 1. Test Text Generation
      let textOk = false;
      let textError = "";
      try {
        const textRes = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: "Say 'API OK'",
        });
        textOk = textRes.text?.includes('API OK') || false;
      } catch (e: any) {
        console.error("Text test failed:", e);
        textError = e.message || "Unknown text generation error";
      }

      // 2. List Models
      let models: string[] = [];
      try {
        const modelList = await ai.models.list();
        const modelsArray = (modelList as any).models || [];
        models = modelsArray.map((m: any) => m.name.replace('models/', ''));
      } catch (e: any) {
        console.error("Model list failed:", e);
      }

      setApiStatus({
        keyFound: true,
        textOk,
        textError,
        models,
      });
    } catch (err: any) {
      setApiStatus({ keyFound: true, textOk: false, models: [], error: err.message });
    } finally {
      setCheckingApi(false);
    }
  };

  const generateImage = async () => {
    if (!imagePrompt.trim()) return;
    setGeneratingImage(true);
    setImageError('');
    setGeneratedImageUrl('');
    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        setImageError("Gemini API Key is missing. Please check your GitHub Secrets and workflow configuration.");
        setGeneratingImage(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: imagePrompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          setGeneratedImageUrl(`data:image/png;base64,${base64Data}`);
          break;
        }
      }
    } catch (err: any) {
      console.error("Full image generation error object:", JSON.stringify(err, null, 2));
      console.error("Error message:", err.message);
      if (err.message && (err.message.includes("429") || err.message.toLowerCase().includes("quota") || err.message.toLowerCase().includes("exhausted"))) {
        setImageError("Quota Exceeded (429): Your API key has hit its daily limit for image generation. Try again tomorrow or check your Google AI Studio quota.");
      } else {
        setImageError(`Generation Failed: ${err.message || "Unknown error"}. (Check browser console for details)`);
      }
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleDownloadImage = () => {
    if (!generatedImageUrl) return;
    const a = document.createElement('a');
    a.href = generatedImageUrl;
    a.download = 'og-image.png';
    a.click();
  };

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
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8">
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

        {/* Image Generator - DEV ONLY */}
        {import.meta.env.DEV && (
          <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-6 shadow-xl md:col-span-2">
            <h2 className="text-xl font-bold text-amber-500 mb-4 font-cinzel flex items-center gap-2">
              <ImageIcon size={24} /> Image Generator (DEV ONLY)
            </h2>
            <p className="text-sm text-stone-400 mb-4">
              Generate high-quality images for your campaign using Nano Banana (Gemini 2.5 Flash Image). Perfect for NPCs, items, locations, or even a campaign logo!
            </p>
            
            <div className="mb-4">
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="w-full h-24 bg-stone-950 border border-stone-800 rounded-xl p-3 text-stone-200 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 mb-4">
              <button 
                onClick={generateImage} 
                disabled={generatingImage || !imagePrompt.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-medium transition-all disabled:opacity-50"
              >
                {generatingImage ? (
                  <><RefreshCw size={18} className="animate-spin" /> Generating Image...</>
                ) : (
                  <><ImageIcon size={18} /> Generate Image</>
                )}
              </button>
              
              {generatedImageUrl && (
                <button 
                  onClick={handleDownloadImage} 
                  className="flex items-center justify-center gap-2 py-3 px-6 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-all"
                >
                  <Download size={18} /> Download
                </button>
              )}
            </div>
            
            {imageError && (
              <div className="p-3 mb-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-xl text-sm">
                {imageError}
              </div>
            )}
            
            {generatedImageUrl && (
              <div className="mt-4 rounded-xl overflow-hidden border border-stone-800 shadow-2xl">
                <img src={generatedImageUrl} alt="Generated" className="w-full h-auto object-cover" />
                <div className="p-4 bg-stone-950 text-sm text-stone-400">
                  <p className="font-bold text-stone-300 mb-1">How to use this image:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Click Download to save the image to your computer.</li>
                    <li>You can upload it to any entity (NPC, Item, Location) via the "Edit" page.</li>
                    <li>To use it as a link preview, upload it to the <code className="text-amber-500 bg-amber-900/20 px-1 rounded">public</code> folder in the code editor and name it <code className="text-amber-500 bg-amber-900/20 px-1 rounded">og-image.png</code>.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Debugger Section - DEV ONLY */}
        {import.meta.env.DEV && (
          <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-6 shadow-xl md:col-span-2">
            <h2 className="text-xl font-bold text-amber-500 mb-4 font-cinzel flex items-center gap-2">
              <ShieldCheck size={24} /> API Status & Model Discovery (DEV ONLY)
            </h2>
            <p className="text-sm text-stone-400 mb-6">
              If image generation is failing with "Quota Exceeded (429)", use this tool to see exactly what models your API key is allowed to use.
            </p>

            <button 
              onClick={checkApiStatus} 
              disabled={checkingApi}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-medium transition-all disabled:opacity-50 mb-6"
            >
              {checkingApi ? (
                <><RefreshCw size={18} className="animate-spin" /> Checking API Status...</>
              ) : (
                <><ShieldCheck size={18} /> Check API Status</>
              )}
            </button>

            {apiStatus && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${apiStatus.keyFound ? 'bg-emerald-900/20 border-emerald-900/50 text-emerald-400' : 'bg-red-900/20 border-red-900/50 text-red-400'} flex items-center gap-3`}>
                    {apiStatus.keyFound ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider">API Key</p>
                      <p className="text-sm">{apiStatus.keyFound ? 'Found in Environment' : 'Missing'}</p>
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border ${apiStatus.textOk ? 'bg-emerald-900/20 border-emerald-900/50 text-emerald-400' : 'bg-red-900/20 border-red-900/50 text-red-400'} flex items-center gap-3`}>
                    {apiStatus.textOk ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider">Text Generation</p>
                      <p className="text-sm">{apiStatus.textOk ? 'Working (Gemini 1.5)' : 'Failed'}</p>
                    </div>
                  </div>
                </div>

                {apiStatus.textError && (
                  <div className="p-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-xl text-sm flex items-start gap-3">
                    <AlertCircle size={20} className="shrink-0" />
                    <div>
                      <p className="font-bold mb-1">Text Generation Error:</p>
                      <p className="font-mono text-[10px] break-all">{apiStatus.textError}</p>
                    </div>
                  </div>
                )}

                {apiStatus.error && (
                  <div className="p-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-xl text-sm flex items-start gap-3">
                    <AlertCircle size={20} className="shrink-0" />
                    <p>{apiStatus.error}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold text-stone-300 mb-3 flex items-center gap-2 uppercase tracking-wider">
                    <List size={16} /> Available Models ({apiStatus.models.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {apiStatus.models.length > 0 ? (
                      apiStatus.models.map(m => (
                        <div key={m} className={`p-2 rounded-lg border text-xs font-mono ${m.includes('image') ? 'bg-amber-900/20 border-amber-900/50 text-amber-400 font-bold' : 'bg-stone-950 border-stone-800 text-stone-400'}`}>
                          {m}
                        </div>
                      ))
                    ) : (
                      <p className="text-stone-500 text-sm italic">No models found or list failed.</p>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-500 mt-4 italic">
                    Note: If you see models in this list but they still return 429 errors, it means Google has restricted your account's quota for those specific models (often due to regional restrictions or billing status).
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
