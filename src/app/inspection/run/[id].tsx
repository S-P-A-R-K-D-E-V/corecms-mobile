import { useLocalSearchParams } from 'expo-router';
import { InspectionRunScreen } from 'src/features/inspection/InspectionRunScreen';

export default function InspectionRun() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InspectionRunScreen key={id} id={id} />;
}
