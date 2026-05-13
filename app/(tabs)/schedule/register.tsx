import { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Card, Button, Chip, RadioButton, useTheme, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import dayjs from 'dayjs';

import { getAllShiftTemplates } from 'src/api/schedule';
import { registerShift, unregisterShift, getMyShiftRegistrations } from 'src/api/shiftRegistration';
import type { IShiftTemplate, IShiftRegistration } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export default function RegisterShiftScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const theme = useTheme();

  const [templates, setTemplates] = useState<IShiftTemplate[]>([]);
  const [registrations, setRegistrations] = useState<IShiftRegistration[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tmpl, regs] = await Promise.all([
          getAllShiftTemplates(),
          getMyShiftRegistrations(date, date),
        ]);
        setTemplates(tmpl.filter((t) => t.isActive));
        setRegistrations(regs);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  function getRegistration(templateId: string) {
    return registrations.find((r) => r.shiftTemplateId === templateId);
  }

  async function handleRegister() {
    if (!selected) {
      Alert.alert('Thông báo', 'Vui lòng chọn ca làm việc');
      return;
    }
    setSubmitting(true);
    try {
      await registerShift({ shiftTemplateId: selected, date });
      Alert.alert('Thành công', 'Đăng ký ca thành công!');
      router.back();
    } catch (err: any) {
      Alert.alert('Đăng ký thất bại', err?.message || 'Vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnregister(registrationId: string) {
    Alert.alert('Xác nhận', 'Huỷ đăng ký ca này?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Huỷ đăng ký',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await unregisterShift({ registrationId });
            Alert.alert('Thành công', 'Đã huỷ đăng ký');
            router.back();
          } catch {
            Alert.alert('Lỗi', 'Thao tác thất bại');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <View style={styles.dateHeader}>
        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
          Đăng ký ca — {dayjs(date).format('DD/MM/YYYY')}
        </Text>
      </View>

      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => {
          const reg = getRegistration(item.id);
          const isRegistered = !!reg;
          return (
            <Card
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface },
                selected === item.id && { borderColor: theme.colors.primary, borderWidth: 2 },
              ]}
              onPress={() => !isRegistered && setSelected(item.id)}
            >
              <Card.Content style={styles.cardContent}>
                <View style={styles.cardLeft}>
                  <RadioButton
                    value={item.id}
                    status={selected === item.id ? 'checked' : 'unchecked'}
                    onPress={() => !isRegistered && setSelected(item.id)}
                    color={theme.colors.primary}
                    disabled={isRegistered}
                  />
                  <View>
                    <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>{item.name}</Text>
                    <Text variant="bodySmall" style={{ color: '#637381' }}>
                      {item.startTime} – {item.endTime}
                      {item.breakMinutes > 0 ? ` · Nghỉ ${item.breakMinutes} phút` : ''}
                    </Text>
                  </View>
                </View>
                {isRegistered && (
                  <View style={styles.cardRight}>
                    <Chip
                      compact
                      style={{ backgroundColor: reg.status === 'Approved' ? '#00A76F20' : '#FF8F0020' }}
                      textStyle={{ color: reg.status === 'Approved' ? '#00A76F' : '#FF8F00', fontSize: 11 }}
                    >
                      {reg.status === 'Pending' ? 'Chờ duyệt' : 'Đã duyệt'}
                    </Chip>
                    {reg.status === 'Pending' && (
                      <Button
                        compact
                        mode="text"
                        textColor="#FF5630"
                        onPress={() => handleUnregister(reg.id)}
                      >
                        Huỷ
                      </Button>
                    )}
                  </View>
                )}
              </Card.Content>
            </Card>
          );
        }}
      />

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline }]}>
        <Button
          mode="contained"
          onPress={handleRegister}
          loading={submitting}
          disabled={!selected || submitting}
          style={styles.submitBtn}
          contentStyle={{ paddingVertical: 6 }}
          labelStyle={{ fontSize: 15 }}
        >
          Xác nhận đăng ký
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateHeader: { padding: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 8 },
  card: { borderRadius: 14 },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: { borderRadius: 12 },
});
