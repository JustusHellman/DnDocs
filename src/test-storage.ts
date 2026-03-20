import { getStorage, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';

async function test() {
  try {
    const r = ref(storage, 'test.txt');
    await uploadString(r, 'hello');
    console.log('Upload success');
  } catch (e) {
    console.error('Upload failed', e);
  }
}
test();
