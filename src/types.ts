export type SessionType = 'chat' | 'code' | 'image';

export interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  type: 'text' | 'image_url' | 'code';
  createdAt: any;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  type: SessionType;
  createdAt: any;
  lastMessage?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: any;
}
