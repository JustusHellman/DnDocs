import { ME, AS_DM, campaign } from './state';
export function useAuth() { return { user: ME, firebaseUser: null, loading: false, currentCampaign: campaign, setCurrentCampaign: () => {}, isDM: AS_DM, isOwner: AS_DM, login: async () => {}, logout: async () => {} } as never; }
export function AuthProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
