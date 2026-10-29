import { useLocalSearchParams } from 'expo-router';
import { HrContractSignScreen } from 'src/features/hr/HrContractSignScreen';

export default function HrContractSign() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HrContractSignScreen key={id} id={id} />;
}
