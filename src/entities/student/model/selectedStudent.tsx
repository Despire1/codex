import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';

type SelectedStudentContextValue = {
  selectedStudentId: number | null;
  setSelectedStudentId: Dispatch<SetStateAction<number | null>>;
};

const SelectedStudentContext = createContext<SelectedStudentContextValue | null>(null);

export const SelectedStudentProvider = ({ children }: PropsWithChildren) => {
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const value = useMemo(
    () => ({ selectedStudentId, setSelectedStudentId }),
    [selectedStudentId],
  );

  return <SelectedStudentContext.Provider value={value}>{children}</SelectedStudentContext.Provider>;
};

export const useSelectedStudent = () => {
  const context = useContext(SelectedStudentContext);
  if (!context) {
    throw new Error('useSelectedStudent must be used within SelectedStudentProvider');
  }
  return context;
};
