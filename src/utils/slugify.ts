import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function generateBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except space and hyphen)
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

export async function generateUniqueId(name: string): Promise<string> {
  const baseSlug = generateBaseSlug(name) || 'untitled';
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const docRef = doc(db, 'entities', slug);
    try {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        return slug;
      }
    } catch (error: any) {
      // If we get a permission error, it means the document exists but we don't have access to it.
      // We should treat this as the document existing and try the next slug.
      if (error.code === 'permission-denied' || (error.message && error.message.includes('Missing or insufficient permissions'))) {
        // Document exists, continue to next slug
      } else {
        throw error;
      }
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
    
    // Safety break
    if (counter > 100) return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  }
}
