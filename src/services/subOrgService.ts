import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { SubOrganization } from '../types';

// Complete list of CircuitRunners sub-organizations
const defaultSubOrganizations: Omit<SubOrganization, 'id'>[] = [
  { name: 'Outreach', initialBudget: 8000, credit: 0, budgetAllocated: 8000, budgetSpent: 0 },
  { name: 'Marketing', initialBudget: 6000, credit: 0, budgetAllocated: 6000, budgetSpent: 0 },
  { name: 'FTC 1002', initialBudget: 12000, credit: 0, budgetAllocated: 12000, budgetSpent: 0 },
  { name: 'FTC 11347', initialBudget: 10000, credit: 0, budgetAllocated: 10000, budgetSpent: 0 },
  { name: 'FRC', initialBudget: 15000, credit: 0, budgetAllocated: 15000, budgetSpent: 0 },
  { name: 'Operations', initialBudget: 9000, credit: 0, budgetAllocated: 9000, budgetSpent: 0 },
  { name: 'Fundraising', initialBudget: 4000, credit: 0, budgetAllocated: 4000, budgetSpent: 0 },
  { name: 'Miscellaneous', initialBudget: 3000, credit: 0, budgetAllocated: 3000, budgetSpent: 0 },
  { name: 'Equipment', initialBudget: 7500, credit: 0, budgetAllocated: 7500, budgetSpent: 0 },
  { name: 'Travel', initialBudget: 5000, credit: 0, budgetAllocated: 5000, budgetSpent: 0 },
  { name: 'Training', initialBudget: 2500, credit: 0, budgetAllocated: 2500, budgetSpent: 0 },
  { name: 'Community Events', initialBudget: 4500, credit: 0, budgetAllocated: 4500, budgetSpent: 0 }
];

export const getSubOrganizations = async (): Promise<SubOrganization[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'subOrganizations'));
    
    if (querySnapshot.empty) {
      console.log('No sub-organizations found, initializing with defaults...');
      await initializeSubOrganizations();
      return await getSubOrganizations();
    }
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SubOrganization[];
  } catch (error) {
    console.error('Error fetching sub-organizations:', error);
    return defaultSubOrganizations.map((org, index) => ({
      id: `default-${index}`,
      ...org
    }));
  }
};

export const initializeSubOrganizations = async () => {
  try {
    const batch = defaultSubOrganizations.map(async (org) => {
      await addDoc(collection(db, 'subOrganizations'), {
        ...org,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    
    await Promise.all(batch);
    console.log('Sub-organizations initialized successfully');
  } catch (error) {
    console.error('Error initializing sub-organizations:', error);
    throw error;
  }
};

export const updateSubOrgBudget = async (
  subOrgId: string,
  newBudgetAllocated: number,
  newSpent?: number,
  newInitialBudget?: number,
  newCredit?: number
) => {
  try {
    const updateData: any = {
      // budgetAllocated: newBudgetAllocated,
      updatedAt: serverTimestamp()
    };

    if (newSpent !== undefined) {
      updateData.budgetSpent = newSpent;
    }

    if (newInitialBudget !== undefined) {
      updateData.initialBudget = newInitialBudget;
    }

    if (newCredit !== undefined) {
      updateData.credit = newCredit;
    }
    updateData.budgetAllocated = updateData.initialBudget + updateData.credit;
    await updateDoc(doc(db, 'subOrganizations', subOrgId), updateData);
  } catch (error) {
    console.error('Error updating sub-organization budget:', error);
    throw error;
  }
};

export const getSubOrgById = async (subOrgId: string): Promise<SubOrganization | null> => {
  try {
    const docRef = doc(db, 'subOrganizations', subOrgId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as SubOrganization;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching sub-organization:', error);
    return null;
  }
};