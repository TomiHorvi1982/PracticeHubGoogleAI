import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  QueryConstraint,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

import firebaseConfigData from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  projectId: firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: firebaseConfigData.appId,
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db: Firestore = getFirestore(app, firebaseConfigData.firestoreDatabaseId);
const auth: Auth = getAuth(app);

export { app, db, auth };

// Generic Firestore Helpers with Error Handling
export async function setFirestoreDoc<T>(collectionName: string, id: string, data: T): Promise<boolean> {
  try {
    const docRef = doc(db, collectionName, id);
    await setDoc(docRef, data, { merge: true });
    return true;
  } catch (err) {
    console.warn(`Firestore setDoc error for ${collectionName}/${id}:`, err);
    return false;
  }
}

export async function getFirestoreDoc<T>(collectionName: string, id: string): Promise<T | null> {
  try {
    const docRef = doc(db, collectionName, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as T;
    }
    return null;
  } catch (err) {
    console.warn(`Firestore getDoc error for ${collectionName}/${id}:`, err);
    return null;
  }
}

export async function getAllFirestoreDocs<T>(collectionName: string, ...queryConstraints: QueryConstraint[]): Promise<T[]> {
  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, ...queryConstraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  } catch (err) {
    console.warn(`Firestore getDocs error for ${collectionName}:`, err);
    return [];
  }
}

export async function deleteFirestoreDoc(collectionName: string, id: string): Promise<boolean> {
  try {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.warn(`Firestore deleteDoc error for ${collectionName}/${id}:`, err);
    return false;
  }
}

export function subscribeFirestoreCollection<T>(
  collectionName: string,
  onData: (data: T[]) => void | Promise<void>,
  ...queryConstraints: QueryConstraint[]
): () => void {
  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, ...queryConstraints);
    return onSnapshot(
      q,
      (snap) => {
        try {
          const items = snap.docs.map((d) => d.data() as T);
          const res = onData(items);
          if (res && typeof (res as Promise<void>).catch === 'function') {
            (res as Promise<void>).catch((err) => {
              console.warn(`Async error in Firestore onData subscriber for ${collectionName}:`, err);
            });
          }
        } catch (err) {
          console.warn(`Error processing snapshot for ${collectionName}:`, err);
        }
      },
      (err) => {
        console.warn(`Firestore onSnapshot error for ${collectionName}:`, err);
      }
    );
  } catch (err) {
    console.warn(`Failed to set up listener for ${collectionName}:`, err);
    return () => {};
  }
}

