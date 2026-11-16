import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Avatar, Button, Chip, Icon, Pressable, SegmentedControl, Spinner, SuccessOverlay, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { haptics } from 'src/services/haptics';
import { getStorageUrl } from 'src/api/axios';
import { createViolations, getViolationCatalog, getViolationStaff, removeViolationPhoto, uploadViolationPhoto } from 'src/api/hr';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import type { IViolationRule, IViolationStaff } from 'src/types/hr';
import { DayStrip } from 'src/features/manage/DayStrip';
import { fVnd, ruleMoney } from './hr-rules';
import { captureViolationPhoto, discardViolationPhoto, pickViolationPhotos, type LocalViolationPhoto } from './violation-photos';
import {
  MAX_NEW_RULE_POINTS,
  MAX_PHOTOS,
  MAX_QUANTITY,
  NEW_RULE_GROUP,
  NOTE_PRESETS,
  blockReason,
  exactRule,
  groupRules,
  searchStaff,
  shortName,
  toggleNotePreset,
  topRules,
  type NewRuleDraft,
  type PhotoStatus,
} from './violation-record';

// ----------------------------------------------------------------------
// Ghi vi phạm nhanh (chủ tịch duyệt 16/11/2026, docs/cici/plans/hr-violation-quick-record-plan.md): một trang cuộn, các bước
// đánh số, nút Ghi nhận dính ở đáy cho ngón cái. Ai (đang trong ca lên trước, tìm không dấu) → lỗi gì (Hay dùng / danh mục /
// loại mới — chỉ hr.rule.manage) → ngày + ca → ảnh minh chứng (chụp / thư viện, tải ngay trong nền) → căn cứ → số lần.
// Căn cứ = ảnh hoặc chữ. Ảnh tự xoá sau 90 ngày (core-be). Mở từ lối tắt "Ghi vi phạm" và nút ở Vi phạm & điểm trừ.
// ----------------------------------------------------------------------

type DraftPhoto = {
  key: string;
  local: LocalViolationPhoto;
  status: PhotoStatus;
  photoId?: string;
  objectKey?: string;
};

const ISO = 'YYYY-MM-DD';

function shiftLabel(s: IViolationStaff['shifts'][number]): string {
  return `${s.name ?? 'Ca'} ${s.start}–${s.end}`;
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-row items-center rounded-[12px] border border-line dark:border-line-dark overflow-hidden">
        <Pressable
          accessibilityLabel={`Giảm ${label}`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          className="w-12 h-11 items-center justify-center"
        >
          <Icon name="minus" size={20} tone={value <= min ? 'faint' : 'default'} />
        </Pressable>
        <Text variant="headline" className="min-w-[44px] text-center">{value}</Text>
        <Pressable
          accessibilityLabel={`Tăng ${label}`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          className="w-12 h-11 items-center justify-center"
        >
          <Icon name="plus" size={20} tone={value >= max ? 'faint' : 'default'} />
        </Pressable>
      </View>
      <Text variant="bodySmall" tone="muted">{label}</Text>
    </View>
  );
}

function StepTitle({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
        <Text variant="micro" tone="inverse" className="font-bold">{n}</Text>
      </View>
      <Text variant="footnote" tone="muted" className="font-semibold flex-1">{title}</Text>
      {right}
    </View>
  );
}

export function RecordViolationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const canManageRules = hasPermission(user, PERMISSIONS.hr.ruleManage);

  const today = dayjs().format(ISO);
  const yesterday = dayjs().subtract(1, 'day').format(ISO);
  const [date, setDate] = useState(today);
  const [pickingDate, setPickingDate] = useState(false);
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));

  const [people, setPeople] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [rule, setRule] = useState<IViolationRule | null>(null);
  const [keepRuleId, setKeepRuleId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<NewRuleDraft | null>(null);
  const [ruleSheet, setRuleSheet] = useState(false);
  const [ruleQuery, setRuleQuery] = useState('');
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const catalogQuery = useQuery({ queryKey: ['hr', 'violations', 'catalog'], queryFn: getViolationCatalog });
  const staffQuery = useQuery({ queryKey: ['hr', 'violations', 'staff', date], queryFn: () => getViolationStaff(date) });
  const rules = catalogQuery.data?.rules ?? [];
  const perPoint = catalogQuery.data?.policy?.fineAmountPerPoint;
  const staff = staffQuery.data ?? [];
  const groups = useMemo(() => [...new Set([...rules.map((r) => r.groupName), NEW_RULE_GROUP])], [rules]);

  // Loại mới vừa ghi: sau khi danh mục tải lại thì chọn sẵn để "Ghi tiếp".
  useEffect(() => {
    if (!keepRuleId) return;
    const found = rules.find((r) => r.id === keepRuleId);
    if (found) {
      setRule(found);
      setKeepRuleId(null);
    }
  }, [keepRuleId, rules]);

  // Đổi người / ngày thì bỏ ca đã chọn.
  useEffect(() => setShiftId(null), [date, people]);

  // Rời màn khi còn ảnh / chữ chưa ghi: hỏi trước, đồng ý thì xoá ảnh tạm (máy + R2).
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const dirtyRef = useRef(false);
  dirtyRef.current = photos.length > 0 || note.trim().length > 0;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirtyRef.current) return;
        e.preventDefault();
        Alert.alert('Bỏ bản ghi này?', 'Ảnh và căn cứ đang nhập sẽ bị xoá.', [
          { text: 'Ở lại', style: 'cancel' },
          {
            text: 'Bỏ',
            style: 'destructive',
            onPress: () => {
              for (const p of photosRef.current) {
                if (p.photoId) removeViolationPhoto(p.photoId).catch(() => {});
                discardViolationPhoto(p.local.uri);
              }
              dirtyRef.current = false;
              navigation.dispatch(e.data.action);
            },
          },
        ]);
      }),
    [navigation],
  );

  // ---- ảnh
  async function upload(key: string, local: LocalViolationPhoto) {
    setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'uploading' } : p)));
    try {
      const r = await uploadViolationPhoto(local, local.source);
      setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'done', ...r } : p)));
    } catch (err) {
      setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'error' } : p)));
      toast.error(extractApiError(err), 'Ảnh chưa tải lên được');
    }
  }

  function addPhotos(list: LocalViolationPhoto[]) {
    const room = MAX_PHOTOS - photosRef.current.length;
    const added = list.slice(0, room).map((local) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      local,
      status: 'uploading' as PhotoStatus,
    }));
    for (const extra of list.slice(room)) discardViolationPhoto(extra.uri);
    if (added.length === 0) return;
    setPhotos((ps) => [...ps, ...added]);
    for (const p of added) upload(p.key, p.local);
  }

  async function takePhoto() {
    const p = await captureViolationPhoto();
    if (p) addPhotos([p]);
  }

  async function choosePhotos() {
    addPhotos(await pickViolationPhotos(MAX_PHOTOS - photos.length));
  }

  function removePhoto(p: DraftPhoto) {
    setPhotos((ps) => ps.filter((x) => x.key !== p.key));
    if (p.photoId) removeViolationPhoto(p.photoId).catch(() => {});
    discardViolationPhoto(p.local.uri);
  }

  // ---- người
  const selected = people.map((id) => staff.find((s) => s.userId === id)).filter((s): s is IViolationStaff => !!s);
  const featured = staff.filter((s) => (date === today ? s.onShiftNow || s.shifts.length > 0 : s.shifts.length > 0)).slice(0, 12);
  const listed = search.trim() ? searchStaff(staff, search).slice(0, 12) : showAll ? staff : [];
  function togglePerson(id: string) {
    haptics.selection();
    setPeople((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  const onePerson = selected.length === 1 ? selected[0] : null;

  // ---- tóm tắt
  const points = (rule?.points ?? newRule?.points ?? 0) * qty;
  const money = rule ? ruleMoney(rule, perPoint, qty) : newRule ? ruleMoney({ points: newRule.points }, perPoint, qty) : null;
  const reason = blockReason({ people: people.length, hasRule: !!rule, newRule, quantity: qty, note, photos });

  async function submit() {
    if (reason) return;
    setBusy(true);
    try {
      const created = await createViolations({
        ruleId: rule?.id ?? null,
        newRule: rule || !newRule
          ? null
          : { groupName: newRule.groupName, name: newRule.name.trim(), points: newRule.points, component: newRule.component },
        userIds: people,
        occurredOn: date,
        quantity: qty,
        note: note.trim(),
        photoKeys: photos.filter((p) => p.status === 'done' && p.objectKey).map((p) => p.objectKey!),
        shiftAssignmentId: onePerson ? shiftId : null,
      });
      for (const p of photos) discardViolationPhoto(p.local.uri);
      setPhotos([]);
      setNote('');
      dirtyRef.current = false;
      if (!rule && created[0]) {
        setNewRule(null);
        setKeepRuleId(created[0].ruleId ?? null);
      }
      haptics.success();
      setOverlay(true);
      setDone(created.length);
      qc.invalidateQueries({ queryKey: ['hr', 'violations'] });
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Chưa ghi được');
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setPeople([]);
    setSearch('');
    setQty(1);
    setDone(null);
  }

  const dateChip = date === today ? 'today' : date === yesterday ? 'yesterday' : 'other';

  return (
    <Screen padded={false} tabBarInset={false} edges={['top', 'left', 'right']}>
      <View className="px-4 pt-4 pb-1.5">
        <AppHeader title="Ghi vi phạm" back />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-2 pb-6 gap-5"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        {/* 1. Ai */}
        <View className="gap-2.5">
          <StepTitle n={1} title={date === today ? 'Ai vi phạm · đang trong ca hôm nay' : `Ai vi phạm · có ca ${dayjs(date).format('DD/MM')}`} />
          {staffQuery.isError ? (
            <Button size="sm" variant="outline" onPress={() => staffQuery.refetch()}>Không tải được nhân viên — thử lại</Button>
          ) : null}
          {featured.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-2">
              {featured.map((s) => {
                const on = people.includes(s.userId);
                return (
                  <Pressable
                    key={s.userId}
                    onPress={() => togglePerson(s.userId)}
                    accessibilityLabel={`${on ? 'Bỏ chọn' : 'Chọn'} ${s.fullName}`}
                    className="w-16 items-center gap-1"
                  >
                    <View className={on ? 'rounded-full border-[3px] border-primary p-0.5' : 'rounded-full border-[3px] border-transparent p-0.5'}>
                      <Avatar name={s.fullName} uri={s.avatarUrl ? getStorageUrl(s.avatarUrl) : null} size={52} online={s.onShiftNow} />
                    </View>
                    <Text variant="caption" numberOfLines={1} className={on ? 'font-bold' : 'font-medium'}>{shortName(s.fullName)}</Text>
                    <Text variant="micro" tone="muted" numberOfLines={1}>{s.shifts[0] ? `${s.shifts[0].start}–${s.shifts[0].end}` : ''}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : staffQuery.data ? (
            <Text variant="caption" tone="muted">Không ai có ca ngày này — tìm tên bên dưới.</Text>
          ) : null}
          {selected.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {selected.map((s) => (
                <Chip key={s.userId} size="sm" color="primary" selected label={`${s.fullName}  ✕`} onPress={() => togglePerson(s.userId)} />
              ))}
            </View>
          ) : null}
          <TextField icon="magnify" placeholder="Tìm nhân viên (gõ không dấu)…" value={search} onChangeText={setSearch} />
          {listed.map((s) => {
            const on = people.includes(s.userId);
            return (
              <Pressable key={s.userId} onPress={() => togglePerson(s.userId)} className="flex-row items-center gap-3 py-1.5">
                <Avatar name={s.fullName} uri={s.avatarUrl ? getStorageUrl(s.avatarUrl) : null} size={36} />
                <View className="flex-1">
                  <Text variant="bodySmall" className={on ? 'font-bold' : 'font-medium'}>{s.fullName}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {s.shifts.length ? s.shifts.map(shiftLabel).join(', ') : 'Không có ca'}
                    {s.monthPoints > 0 ? ` · −${s.monthPoints} điểm tháng này` : ''}
                  </Text>
                </View>
                <Icon name={on ? 'check-circle' : 'checkbox-blank-circle-outline'} size={22} tone={on ? 'primary' : 'faint'} />
              </Pressable>
            );
          })}
          {!search.trim() && staff.length > 0 ? (
            <Button size="sm" variant="ghost" onPress={() => setShowAll((v) => !v)}>
              {showAll ? 'Thu gọn danh sách' : `Xem tất cả nhân viên (${staff.length})`}
            </Button>
          ) : null}
        </View>

        {/* 2. Lỗi gì */}
        <View className="gap-2.5">
          <StepTitle n={2} title="Lỗi gì" />
          {rule ? (
            <SectionCard
              title={`${rule.name} · −${rule.points}`}
              right={<Button size="sm" variant="ghost" fullWidth={false} onPress={() => setRule(null)}>Đổi</Button>}
              bodyClassName="pt-0 gap-1"
            >
              <Text variant="caption" tone="muted">
                {rule.groupName}
                {(ruleMoney(rule, perPoint) ?? 0) > 0 ? ` · ${fVnd(ruleMoney(rule, perPoint))} / lần, trừ lương` : ''}
              </Text>
              {rule.autoSource !== 'None' ? (
                <Text variant="caption" tone="warning">Hành vi này hệ thống đã tự ghi theo dữ liệu — chỉ ghi tay khi hệ thống không có dữ liệu.</Text>
              ) : null}
              {rule.escalationSteps ? (
                <Text variant="caption" tone="muted">
                  Tái phạm trong {rule.escalationWindowMonths ?? 1} tháng: {rule.escalationSteps.split('\n').join('; ')}
                </Text>
              ) : null}
            </SectionCard>
          ) : newRule ? (
            <SectionCard
              title="Loại vi phạm mới"
              right={<Button size="sm" variant="ghost" fullWidth={false} onPress={() => setNewRule(null)}>Huỷ</Button>}
              bodyClassName="pt-0 gap-2.5"
            >
              <TextField
                label="Tên loại vi phạm"
                placeholder="Vd: Ăn uống trong quầy thu ngân"
                value={newRule.name}
                onChangeText={(name) => setNewRule({ ...newRule, name })}
              />
              <View className="flex-row flex-wrap gap-1.5">
                {groups.map((g) => (
                  <Chip key={g} size="sm" color="primary" label={g} selected={newRule.groupName === g} onPress={() => setNewRule({ ...newRule, groupName: g })} />
                ))}
              </View>
              <Stepper
                value={newRule.points}
                min={1}
                max={MAX_NEW_RULE_POINTS}
                label={`điểm${(ruleMoney({ points: newRule.points }, perPoint) ?? 0) > 0 ? ` = ${fVnd(ruleMoney({ points: newRule.points }, perPoint))} / lần, trừ lương` : ''}`}
                onChange={(points) => setNewRule({ ...newRule, points })}
              />
              <SegmentedControl
                value={newRule.component}
                onChange={(k) => setNewRule({ ...newRule, component: k as NewRuleDraft['component'] })}
                segments={[
                  { key: 'Discipline', label: 'Kỷ luật' },
                  { key: 'Reconciliation', label: 'Đối soát' },
                ]}
              />
              <Text variant="caption" tone="muted">Lưu vào danh mục để lần sau chọn lại. Cờ mất thưởng, bậc tái phạm: sửa trên web.</Text>
            </SectionCard>
          ) : (
            <>
              <View className="flex-row flex-wrap gap-1.5">
                {topRules(rules).map((r) => (
                  <Chip key={r.id} color="primary" label={`${r.name} · −${r.points}`} onPress={() => { haptics.selection(); setRule(r); }} />
                ))}
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                <Chip icon="magnify" label="Tìm trong danh mục" onPress={() => setRuleSheet(true)} />
                {canManageRules ? (
                  <Chip
                    icon="plus"
                    color="primary"
                    variant="outlined"
                    label="Loại vi phạm mới"
                    onPress={() => setNewRule({ name: '', groupName: NEW_RULE_GROUP, points: 2, component: 'Discipline' })}
                  />
                ) : null}
              </View>
              {catalogQuery.data && !catalogQuery.data.policy ? (
                <Text variant="caption" tone="warning">Cửa hàng chưa có danh mục vi phạm — Admin thêm trên web.</Text>
              ) : null}
            </>
          )}
        </View>

        {/* 3. Khi nào */}
        <View className="gap-2.5">
          <StepTitle n={3} title="Khi nào" />
          <View className="flex-row flex-wrap gap-1.5">
            <Chip color="primary" label="Hôm nay" selected={dateChip === 'today' && !pickingDate} onPress={() => { setDate(today); setPickingDate(false); }} />
            <Chip color="primary" label="Hôm qua" selected={dateChip === 'yesterday' && !pickingDate} onPress={() => { setDate(yesterday); setPickingDate(false); }} />
            <Chip
              color="primary"
              icon="calendar"
              label={dateChip === 'other' ? dayjs(date).format('DD/MM/YYYY') : 'Chọn ngày'}
              selected={dateChip === 'other' || pickingDate}
              onPress={() => setPickingDate((v) => !v)}
            />
          </View>
          {pickingDate ? (
            <DayStrip
              weekStart={weekStart}
              selected={date}
              onSelectDate={(iso) => {
                if (iso > today) {
                  toast.error('Ngày vi phạm không được sau hôm nay.');
                  return;
                }
                setDate(iso);
              }}
              onShiftWeek={(dir) => setWeekStart((w) => (dir > 0 && w.add(7, 'day').format(ISO) > today ? w : w.add(dir * 7, 'day')))}
            />
          ) : null}
          {onePerson ? (
            onePerson.shifts.length > 1 ? (
              <View className="flex-row flex-wrap gap-1.5">
                {onePerson.shifts.map((s) => (
                  <Chip key={s.assignmentId} size="sm" color="primary" label={shiftLabel(s)} selected={shiftId === s.assignmentId}
                    onPress={() => setShiftId(shiftId === s.assignmentId ? null : s.assignmentId)} />
                ))}
              </View>
            ) : (
              <Text variant="caption" tone="muted">
                {onePerson.shifts.length === 1 ? `Ca: ${shiftLabel(onePerson.shifts[0])} (tự gắn)` : 'Không có ca ngày này — ghi không theo ca.'}
              </Text>
            )
          ) : people.length > 1 ? (
            <Text variant="caption" tone="muted">Tự gắn ca của từng người (khi người đó có đúng một ca ngày này).</Text>
          ) : null}
        </View>

        {/* 4. Ảnh */}
        <View className="gap-2.5">
          <StepTitle n={4} title={`Ảnh minh chứng · ${photos.length}/${MAX_PHOTOS}`} />
          {photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {photos.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => (p.status === 'error' ? upload(p.key, p.local) : undefined)}
                  accessibilityLabel={p.status === 'error' ? 'Thử tải lại ảnh' : 'Ảnh minh chứng'}
                  className="w-[76px] h-[76px] rounded-[12px] overflow-hidden bg-surface dark:bg-surface-dark"
                >
                  <Image source={{ uri: p.local.uri }} style={{ width: '100%', height: '100%' }} />
                  {p.status !== 'done' ? (
                    <View className="absolute inset-0 items-center justify-center bg-black/40">
                      {p.status === 'uploading' ? <Spinner color="#FFFFFF" /> : <Icon name="refresh" size={24} tone="inverse" />}
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => removePhoto(p)}
                    hitSlop={8}
                    accessibilityLabel="Bỏ ảnh"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 items-center justify-center"
                  >
                    <Icon name="close" size={14} tone="inverse" />
                  </Pressable>
                  <View className="absolute left-1 bottom-1 rounded px-1 bg-black/50">
                    <Text variant="nano" tone="inverse">{p.local.source === 'Camera' ? 'Chụp' : 'Thư viện'}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button variant="outline" icon="camera" disabled={photos.length >= MAX_PHOTOS} onPress={takePhoto}>Chụp</Button>
            </View>
            <View className="flex-1">
              <Button variant="outline" icon="image-multiple" disabled={photos.length >= MAX_PHOTOS} onPress={choosePhotos}>Thư viện</Button>
            </View>
          </View>
          <Text variant="caption" tone="muted">Ảnh tự xoá sau 90 ngày. Nhân viên xem được ảnh để khiếu nại.</Text>
        </View>

        {/* 5. Căn cứ */}
        <View className="gap-2.5">
          <StepTitle n={5} title={photos.some((p) => p.status === 'done') ? 'Căn cứ (tuỳ chọn khi đã có ảnh)' : 'Căn cứ'} />
          <View className="flex-row flex-wrap gap-1.5">
            {NOTE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                size="sm"
                color="primary"
                label={preset}
                selected={note.split(';').map((x) => x.trim()).includes(preset)}
                onPress={() => setNote((n) => toggleNotePreset(n, preset))}
              />
            ))}
          </View>
          <TextField placeholder="Vd: camera quầy 19:10–19:25 (nhân viên sẽ thấy)" value={note} onChangeText={setNote} multiline maxLength={1000} />
        </View>

        {/* 6. Số lần */}
        <View className="gap-2.5">
          <StepTitle n={6} title="Số lần" />
          <Stepper value={qty} min={1} max={MAX_QUANTITY} label="lần" onChange={setQty} />
        </View>
      </ScrollView>

      {/* Thanh đáy */}
      <View
        className="px-4 pt-2.5 border-t border-line dark:border-line-dark bg-bg dark:bg-bg-dark gap-1.5"
        style={{ paddingBottom: Math.max(insets.bottom, 10) + 4 }}
      >
        {done != null ? (
          <>
            <Text variant="bodySmall" className="font-semibold text-center">Đã ghi nhận — {done} người được báo.</Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button onPress={again}>Ghi tiếp</Button>
              </View>
              <View className="flex-1">
                <Button variant="outline" onPress={() => router.back()}>Xong</Button>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text variant="caption" tone={reason ? 'muted' : 'default'} numberOfLines={2} className="text-center">
              {reason
                ?? `${people.length} người · −${points} điểm/người${(money ?? 0) > 0 ? ` · ${fVnd(money)}/người, trừ lương` : ''}`}
            </Text>
            <Button size="lg" loading={busy} disabled={busy || !!reason} onPress={submit}>Ghi nhận</Button>
          </>
        )}
      </View>

      <Sheet visible={ruleSheet} title="Danh mục vi phạm" onClose={() => setRuleSheet(false)}>
        <View className="gap-2">
          <TextField icon="magnify" placeholder="Tìm lỗi (gõ không dấu)…" value={ruleQuery} onChangeText={setRuleQuery} autoFocus />
          {canManageRules && ruleQuery.trim() && !exactRule(rules, ruleQuery) ? (
            <Button
              variant="outline"
              icon="plus"
              onPress={() => {
                setNewRule({ name: ruleQuery.trim(), groupName: NEW_RULE_GROUP, points: 2, component: 'Discipline' });
                setRule(null);
                setRuleSheet(false);
                setRuleQuery('');
              }}
            >
              {`Thêm loại mới «${ruleQuery.trim()}»`}
            </Button>
          ) : null}
          {groupRules(rules, ruleQuery).map((g) => (
            <View key={g.group} className="gap-0.5">
              <Text variant="label" tone="muted" className="mt-2">{g.group}</Text>
              {g.rules.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    haptics.selection();
                    setRule(r);
                    setNewRule(null);
                    setRuleSheet(false);
                    setRuleQuery('');
                  }}
                  className="flex-row items-center gap-3 py-2"
                >
                  <View className="flex-1">
                    <Text variant="bodySmall" className="font-medium">{r.name}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {(ruleMoney(r, perPoint) ?? 0) > 0 ? fVnd(ruleMoney(r, perPoint)) : ''}
                      {r.autoSource !== 'None' ? ' · hệ thống tự ghi' : ''}
                    </Text>
                  </View>
                  <Text variant="headline" tone="error">−{r.points}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </Sheet>

      <SuccessOverlay visible={overlay} message="Đã ghi nhận" onDone={() => setOverlay(false)} />
    </Screen>
  );
}
