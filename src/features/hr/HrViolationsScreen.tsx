import { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, Chip, TextField, SegmentedControl, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import {
  cancelViolation,
  complainViolation,
  createViolations,
  getMyViolations,
  getViolationRules,
  getViolations,
  getViolationSummary,
  saveViolationPolicy,
} from 'src/api/hr';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import {
  VIOLATION_STATUS_LABEL,
  type IViolationEntry,
  type IViolationPolicy,
  type IViolationRule,
  type IViolationSummary,
  type ViolationEntryStatus,
} from 'src/types/hr';
import { bonusText, canComplain, monthOf } from './hr-rules';

// ----------------------------------------------------------------------
// Vi phạm & điểm trừ: mỗi lần vi phạm chỉ trừ điểm theo danh mục của cửa hàng — không phạt tiền. Nhân viên xem điểm trừ tháng
// của mình, từng lần (hệ thống tự ghi hoặc quản lý ghi kèm căn cứ) và khiếu nại trong hạn. Quản lý (hr.violation.manage /
// hr.performance.read) xem điểm cả cửa hàng; người có hr.violation.manage ghi tay, huỷ. Sửa danh mục, trả lời khiếu nại: web.
// ----------------------------------------------------------------------

const STATUS_TONE: Record<ViolationEntryStatus, 'error' | 'warning' | 'neutral'> = {
  Active: 'error',
  Disputed: 'warning',
  Cancelled: 'neutral',
};

function MonthSwitch({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = monthOf();
  return (
    <View className="flex-row items-center justify-between">
      <Button size="sm" variant="ghost" icon="chevron-left" fullWidth={false} onPress={() => onChange(monthOf(dayjs(month).subtract(1, 'month')))}>
        Tháng trước
      </Button>
      <Text variant="bodySmall" className="font-semibold">Tháng {dayjs(month).format('MM/YYYY')}</Text>
      <Button
        size="sm"
        variant="ghost"
        fullWidth={false}
        disabled={month >= current}
        onPress={() => onChange(monthOf(dayjs(month).add(1, 'month')))}
      >
        Tháng sau
      </Button>
    </View>
  );
}

/** Mức thưởng theo điểm trừ, kèm ghi chú khi cửa hàng chưa bật tính vào thưởng. */
function bonusWithState(s: IViolationSummary, policy: IViolationPolicy | null | undefined): string | null {
  const label = bonusText(s);
  if (!label) return null;
  return policy?.appliesToBonus ? label : `${label} (chưa tính vào thưởng)`;
}

/** Bật / tắt nhanh tính điểm trừ vào thưởng tuần (Admin). */
function BonusToggle({ policy, onChanged }: { policy: IViolationPolicy; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await saveViolationPolicy(policy, on);
      toast.success(on ? 'Đã bật: thưởng tuần nhận theo điểm trừ.' : 'Đã tắt: điểm trừ chỉ để xem.');
      onChanged();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa lưu được');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard title="Thưởng doanh số tuần" bodyClassName="pt-0 gap-1">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text variant="bodySmall" className="font-semibold">Tính điểm trừ vào thưởng tuần</Text>
          <Text variant="caption" tone="muted">
            Bật: mỗi người nhận % thưởng tuần theo điểm trừ của tháng; phần không nhận chia lại cho người nhận đủ.
          </Text>
        </View>
        <Switch value={!!policy.appliesToBonus} disabled={busy} onValueChange={toggle} accessibilityLabel="Tính điểm trừ vào thưởng tuần" />
      </View>
    </SectionCard>
  );
}

function SummaryBlock({ summary, policy }: { summary: IViolationSummary; policy: IViolationPolicy | null }) {
  const bonus = bonusWithState(summary, policy);
  return (
    <SectionCard title="Điểm trừ tháng này" bodyClassName="pt-0 gap-1.5">
      <View className="flex-row items-end gap-2">
        <Text variant="title" tone={summary.points > 0 ? 'error' : 'success'}>{summary.points}</Text>
        <Text variant="caption" tone="muted" className="mb-1">
          điểm · kỷ luật {summary.disciplinePoints} · đối soát {summary.reconciliationPoints}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {summary.count} lần{summary.disputed > 0 ? ` · ${summary.disputed} đang khiếu nại` : ''}
      </Text>
      {bonus ? <Text variant="bodySmall" className="font-semibold">{bonus}</Text> : null}
      {summary.weeksWithoutBonus.length > 0 ? (
        <Text variant="caption" tone="warning">
          Mất thưởng tuần bắt đầu {summary.weeksWithoutBonus.map((w) => dayjs(w).format('DD/MM')).join(', ')}
        </Text>
      ) : null}
    </SectionCard>
  );
}

function EntryCard({
  entry: e,
  showName,
  onComplain,
  onCancel,
}: {
  entry: IViolationEntry;
  showName?: boolean;
  onComplain?: () => void;
  onCancel?: () => void;
}) {
  return (
    <SectionCard
      title={`−${e.points} · ${e.ruleName}`}
      right={<Badge tone={STATUS_TONE[e.status]}>{VIOLATION_STATUS_LABEL[e.status]}</Badge>}
      bodyClassName="pt-0 gap-1"
    >
      <Text variant="caption" tone="muted">
        {showName ? `${e.fullName} · ` : ''}
        {dayjs(e.occurredOn).format('DD/MM')}
        {e.shiftName ? ` · ${e.shiftName}` : ''} · {e.groupName}
        {e.quantity > 1 ? ` · ${e.quantity} lần` : ''}
        {e.losesWeeklyBonus ? ' · mất thưởng tuần' : ''}
        {e.losesMonthlyBonus ? ' · mất thưởng tháng' : ''}
      </Text>
      {e.note ? <Text variant="bodySmall">Căn cứ: {e.note}</Text> : null}
      <Text variant="caption" tone="muted">{e.isAuto ? 'Hệ thống tự ghi' : 'Quản lý ghi'}</Text>
      {e.complaintText ? <Text variant="caption" tone="warning">Khiếu nại: {e.complaintText}</Text> : null}
      {e.resolutionNote ? <Text variant="caption" tone="muted">Trả lời: {e.resolutionNote}</Text> : null}
      {onComplain && canComplain(e) ? (
        <Button size="sm" variant="outline" onPress={onComplain}>
          {e.complaintDeadline ? `Khiếu nại (hạn ${dayjs(e.complaintDeadline).format('DD/MM')})` : 'Khiếu nại'}
        </Button>
      ) : null}
      {onCancel && e.status === 'Active' ? (
        <Button size="sm" variant="ghost" action="error" onPress={onCancel}>Huỷ điểm trừ</Button>
      ) : null}
    </SectionCard>
  );
}

function TextSheet({
  visible,
  title,
  label,
  hint,
  confirm,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  label: string;
  hint?: string;
  confirm: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} disabled={busy || !text.trim()} onPress={submit}>
          {confirm}
        </Button>
      }
    >
      {hint ? <Text variant="bodySmall" className="mb-2">{hint}</Text> : null}
      <TextField label={label} value={text} onChangeText={setText} multiline />
    </Sheet>
  );
}

// ----------------------------------------------------------------------

function MineTab({ month }: { month: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'violations', 'mine', month], queryFn: () => getMyViolations(month) });
  const [complaining, setComplaining] = useState<IViolationEntry | null>(null);

  async function complain(text: string) {
    if (!complaining) return;
    try {
      await complainViolation(complaining.id, text);
      toast.success('Đã gửi khiếu nại — quản lý sẽ trả lời.');
      setComplaining(null);
      qc.invalidateQueries({ queryKey: ['hr', 'violations'] });
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa gửi được');
    }
  }

  if (query.isError)
    return (
      <View className="py-10 items-center gap-3">
        <Text variant="bodySmall" tone="error">Không tải được điểm trừ: {extractApiError(query.error)}</Text>
        <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
      </View>
    );
  if (!query.data) return null;
  const { summary, entries } = query.data;

  return (
    <>
      <SummaryBlock summary={summary} policy={query.data.policy} />
      {entries.length === 0 ? (
        <View className="py-6 items-center">
          <Text variant="bodySmall" tone="muted">Tháng này bạn không bị trừ điểm nào.</Text>
        </View>
      ) : (
        entries.map((e) => <EntryCard key={e.id} entry={e} onComplain={() => setComplaining(e)} />)
      )}
      <TextSheet
        visible={!!complaining}
        title="Khiếu nại lần ghi nhận"
        label="Lý do khiếu nại"
        hint={complaining ? `${complaining.ruleName} — ngày ${dayjs(complaining.occurredOn).format('DD/MM')}, trừ ${complaining.points} điểm.` : ''}
        confirm="Gửi khiếu nại"
        onClose={() => setComplaining(null)}
        onSubmit={complain}
      />
    </>
  );
}

function CreateSheet({
  visible,
  staff,
  onClose,
  onCreated,
}: {
  visible: boolean;
  staff: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const rulesQuery = useQuery({ queryKey: ['hr', 'violations', 'rules'], queryFn: getViolationRules, enabled: visible });
  const rules = (rulesQuery.data ?? []).filter((r) => r.isActive);
  const groups = useMemo(() => [...new Set(rules.map((r) => r.groupName))], [rules]);
  const [rule, setRule] = useState<IViolationRule | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [daysAgo, setDaysAgo] = useState(0);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const qty = Number(quantity);
  const valid = !!rule && people.length > 0 && Number.isInteger(qty) && qty >= 1 && qty <= 50 && !!note.trim();

  function reset() {
    setRule(null);
    setPeople([]);
    setDaysAgo(0);
    setQuantity('1');
    setNote('');
  }

  async function submit() {
    if (!rule) return;
    setBusy(true);
    try {
      await createViolations({
        ruleId: rule.id,
        userIds: people,
        occurredOn: dayjs().subtract(daysAgo, 'day').format('YYYY-MM-DD'),
        quantity: qty,
        note: note.trim(),
      });
      toast.success('Đã ghi nhận — nhân viên được báo.');
      reset();
      onCreated();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa ghi được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Ghi vi phạm"
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} disabled={busy || !valid} onPress={submit}>
          {rule && valid ? `Ghi nhận (trừ ${rule.points * qty} điểm / người)` : 'Ghi nhận'}
        </Button>
      }
    >
      <View className="gap-3">
        <Text variant="caption" tone="muted">Hành vi</Text>
        {groups.map((g) => (
          <View key={g} className="gap-1">
            <Text variant="caption" className="font-semibold">{g}</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {rules
                .filter((r) => r.groupName === g)
                .map((r) => (
                  <Chip key={r.id} size="sm" label={`${r.name} (−${r.points})`} selected={rule?.id === r.id} color="primary" onPress={() => setRule(r)} />
                ))}
            </View>
          </View>
        ))}
        {rule && rule.autoSource !== 'None' ? (
          <Text variant="caption" tone="warning">Hành vi này hệ thống đã tự ghi theo dữ liệu — chỉ ghi tay khi hệ thống không có dữ liệu.</Text>
        ) : null}
        <Text variant="caption" tone="muted">Nhân viên</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {staff.map((p) => (
            <Chip
              key={p.id}
              size="sm"
              label={p.name}
              color="primary"
              selected={people.includes(p.id)}
              onPress={() => setPeople((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted">Ngày</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {[0, 1, 2].map((d) => (
            <Chip
              key={d}
              size="sm"
              label={d === 0 ? 'Hôm nay' : d === 1 ? 'Hôm qua' : dayjs().subtract(d, 'day').format('DD/MM')}
              selected={daysAgo === d}
              color="primary"
              onPress={() => setDaysAgo(d)}
            />
          ))}
        </View>
        <TextField label="Số lần" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        <TextField
          label="Căn cứ (nhân viên sẽ thấy)"
          placeholder="Vd: camera quầy 19:10–19:25"
          value={note}
          onChangeText={setNote}
          multiline
        />
      </View>
    </Sheet>
  );
}

function TeamTab({ month, canManage, canEditPolicy }: { month: string; canManage: boolean; canEditPolicy: boolean }) {
  const qc = useQueryClient();
  const summaryQuery = useQuery({ queryKey: ['hr', 'violations', 'summary', month], queryFn: () => getViolationSummary(month) });
  const entriesQuery = useQuery({ queryKey: ['hr', 'violations', 'list', month], queryFn: () => getViolations(month) });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<IViolationEntry | null>(null);
  const rows = summaryQuery.data?.rows ?? [];
  const entries = (entriesQuery.data ?? []).filter((e) => !selected || e.userId === selected);

  function refresh() {
    qc.invalidateQueries({ queryKey: ['hr', 'violations'] });
  }

  async function cancel(note: string) {
    if (!cancelling) return;
    try {
      await cancelViolation(cancelling.id, note);
      toast.success('Đã huỷ — nhân viên được báo.');
      setCancelling(null);
      refresh();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa huỷ được');
    }
  }

  if (summaryQuery.isError)
    return (
      <View className="py-10 items-center gap-3">
        <Text variant="bodySmall" tone="error">Không tải được: {extractApiError(summaryQuery.error)}</Text>
        <Button size="sm" variant="outline" fullWidth={false} onPress={() => summaryQuery.refetch()}>Thử lại</Button>
      </View>
    );

  return (
    <>
      {canEditPolicy && summaryQuery.data?.policy ? <BonusToggle policy={summaryQuery.data.policy} onChanged={refresh} /> : null}
      {canManage && summaryQuery.data?.policy ? (
        <Button icon="plus" onPress={() => setCreating(true)}>Ghi vi phạm</Button>
      ) : null}
      {summaryQuery.data && !summaryQuery.data.policy ? (
        <Text variant="caption" tone="warning">Cửa hàng chưa có danh mục vi phạm — Admin thêm trên web.</Text>
      ) : null}
      <SectionCard title="Điểm trừ từng người" bodyClassName="pt-0">
        {rows.map((r) => (
          <Pressable
            key={r.userId}
            onPress={() => setSelected(selected === r.userId ? null : r.userId)}
            className="flex-row items-center gap-2 py-2"
          >
            <View className="flex-1">
              <Text variant="bodySmall" className={selected === r.userId ? 'font-bold' : 'font-medium'}>{r.fullName}</Text>
              <Text variant="caption" tone="muted">
                {r.count} lần{r.disputed > 0 ? ` · ${r.disputed} khiếu nại` : ''}
                {bonusWithState(r, summaryQuery.data?.policy) ? ` · ${bonusWithState(r, summaryQuery.data?.policy)}` : ''}
              </Text>
            </View>
            <Text variant="body" className="font-bold" tone={r.points > 0 ? 'error' : 'muted'}>{r.points}</Text>
          </Pressable>
        ))}
      </SectionCard>
      {selected ? (
        <Button size="sm" variant="ghost" onPress={() => setSelected(null)}>Xem của mọi người</Button>
      ) : null}
      {entries.map((e) => (
        <EntryCard key={e.id} entry={e} showName onCancel={canManage ? () => setCancelling(e) : undefined} />
      ))}
      <CreateSheet
        visible={creating}
        staff={rows.map((r) => ({ id: r.userId, name: r.fullName }))}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          refresh();
        }}
      />
      <TextSheet
        visible={!!cancelling}
        title="Huỷ điểm trừ"
        label="Lý do huỷ (nhân viên sẽ thấy)"
        hint={cancelling ? `${cancelling.fullName} — ${cancelling.ruleName}, ngày ${dayjs(cancelling.occurredOn).format('DD/MM')}.` : ''}
        confirm="Huỷ điểm trừ"
        onClose={() => setCancelling(null)}
        onSubmit={cancel}
      />
    </>
  );
}

export function HrViolationsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const canManage = hasPermission(user, PERMISSIONS.hr.violationManage);
  const canSeeTeam = canManage || hasPermission(user, PERMISSIONS.hr.performanceRead);
  const canEditPolicy = hasPermission(user, PERMISSIONS.hr.ruleManage);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [month, setMonth] = useState(monthOf());

  return (
    <Screen scroll onRefresh={() => qc.invalidateQueries({ queryKey: ['hr', 'violations'] })}>
      <AppHeader title="Vi phạm & điểm trừ" back />
      <Text variant="caption" tone="muted">
        Vi phạm chỉ trừ điểm theo danh mục của cửa hàng — không phạt tiền, không trừ lương. Thấy chưa đúng thì bạn khiếu nại
        trong hạn.
      </Text>
      {canSeeTeam ? (
        <SegmentedControl
          value={tab}
          onChange={(k) => setTab(k as 'mine' | 'team')}
          segments={[
            { key: 'mine', label: 'Của tôi' },
            { key: 'team', label: 'Cả cửa hàng' },
          ]}
        />
      ) : null}
      <MonthSwitch month={month} onChange={setMonth} />
      {tab === 'team' && canSeeTeam ? (
        <TeamTab month={month} canManage={canManage} canEditPolicy={canEditPolicy} />
      ) : (
        <MineTab month={month} />
      )}
    </Screen>
  );
}
