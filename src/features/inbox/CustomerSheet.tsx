import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Chip, Divider, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { setConversationTags, updateConversationCustomer, type ConversationDetail } from 'src/api/inbox';

import { inboxErrorKind, normalizeTags } from './inbox-format';
import { applyConversation, detailKey } from './hooks';

// ----------------------------------------------------------------------
// Thông tin khách của hội thoại: sửa tên / SĐT / địa chỉ / ghi chú (PUT customer — SĐT trùng đúng một khách cũ thì máy chủ
// gắn vào khách cũ, trùng nhiều → 409 Customer.PhoneAmbiguous), nhãn hội thoại, tổng mua + hoá đơn gần nhất. Tạo đơn đặt
// hàng trong hội thoại: sắp có (F4).
// ----------------------------------------------------------------------

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

export function CustomerSheet({
  visible,
  onClose,
  detail,
  canEdit,
  myUserId,
}: {
  visible: boolean;
  onClose: () => void;
  detail: ConversationDetail;
  canEdit: boolean;
  myUserId: string | null;
}) {
  const qc = useQueryClient();
  const panel = detail.customerPanel;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(panel?.name || detail.customer.name || '');
    setPhone(panel?.phone ?? detail.customer.phone ?? '');
    setAddress(panel?.address ?? '');
    setNote(panel?.note ?? '');
    setTagInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, detail.id]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await updateConversationCustomer(detail.id, {
        name: name.trim() || undefined,
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim(),
      });
      qc.setQueryData<ConversationDetail>(detailKey(detail.id), (old) =>
        old
          ? {
              ...old,
              customerPanel: updated ?? old.customerPanel,
              customer: { ...old.customer, name: updated?.name || old.customer.name, phone: updated?.phone ?? old.customer.phone },
            }
          : old
      );
      qc.invalidateQueries({ queryKey: detailKey(detail.id) });
      toast.success('Đã lưu thông tin khách.');
      onClose();
    } catch (err) {
      toast.error(
        inboxErrorKind(err) === 'phone-ambiguous'
          ? 'Số điện thoại này trùng nhiều khách trong danh bạ — sửa khách trên web rồi thử lại.'
          : extractApiError(err)
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveTags(tags: string[]) {
    if (tagBusy) return;
    setTagBusy(true);
    try {
      applyConversation(qc, await setConversationTags(detail.id, normalizeTags(tags)), myUserId);
      setTagInput('');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setTagBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Thông tin khách"
      footer={
        canEdit ? (
          <Button loading={saving} onPress={save} icon="content-save-outline">
            Lưu thông tin khách
          </Button>
        ) : null
      }
    >
      <View className="gap-3 pb-3">
        {panel?.code ? (
          <Text variant="caption" tone="muted">
            Mã khách: {panel.code}
            {panel.source ? ` · Nguồn: ${panel.source}` : ''}
          </Text>
        ) : null}
        <TextField label="Tên khách" value={name} onChangeText={setName} editable={canEdit} maxLength={200} />
        <TextField
          label="Số điện thoại"
          value={phone}
          onChangeText={setPhone}
          editable={canEdit}
          keyboardType="phone-pad"
          maxLength={20}
        />
        <TextField label="Địa chỉ" value={address} onChangeText={setAddress} editable={canEdit} multiline maxLength={500} />
        <TextField label="Ghi chú" value={note} onChangeText={setNote} editable={canEdit} multiline maxLength={1000} />

        <Divider />
        <Text variant="label" tone="muted">Nhãn hội thoại</Text>
        <View className="flex-row flex-wrap gap-2">
          {detail.tags.length === 0 ? <Text variant="caption" tone="faint">Chưa có nhãn.</Text> : null}
          {detail.tags.map((t) => (
            <Chip
              key={t}
              label={canEdit ? `${t}  ✕` : t}
              size="sm"
              color="primary"
              onPress={canEdit ? () => saveTags(detail.tags.filter((x) => x !== t)) : undefined}
            />
          ))}
        </View>
        {canEdit ? (
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <TextField
                placeholder="Thêm nhãn…"
                value={tagInput}
                onChangeText={setTagInput}
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={() => tagInput.trim() && saveTags([...detail.tags, tagInput])}
              />
            </View>
            <Button
              size="sm"
              variant="soft"
              fullWidth={false}
              loading={tagBusy}
              disabled={!tagInput.trim()}
              onPress={() => saveTags([...detail.tags, tagInput])}
            >
              Thêm
            </Button>
          </View>
        ) : null}

        <Divider />
        <Text variant="label" tone="muted">Lịch sử mua</Text>
        {panel ? (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1 rounded-xl bg-ink/5 dark:bg-white/5 px-3 py-2">
                <Text variant="caption" tone="muted">Số đơn</Text>
                <Text variant="headline">{panel.totalOrders}</Text>
              </View>
              <View className="flex-1 rounded-xl bg-ink/5 dark:bg-white/5 px-3 py-2">
                <Text variant="caption" tone="muted">Tổng chi</Text>
                <Text variant="headline">{vnd(panel.totalSpent)}</Text>
              </View>
            </View>
            {panel.lastPurchaseAt ? (
              <Text variant="caption" tone="muted">Mua gần nhất: {dayjs(panel.lastPurchaseAt).format('DD/MM/YYYY')}</Text>
            ) : null}
            {panel.recentInvoices.map((inv) => (
              <View key={inv.id} className="flex-row items-center gap-2 py-1">
                <Text variant="bodySmall" className="font-semibold">{inv.code}</Text>
                <Text variant="caption" tone="muted" className="flex-1">
                  {dayjs(inv.createdAt).format('DD/MM/YYYY')}
                  {inv.channel ? ` · ${inv.channel}` : ''}
                </Text>
                <Text variant="bodySmall">{vnd(inv.total)}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text variant="caption" tone="faint">Khách chưa gắn với danh bạ — nhập SĐT để tìm / tạo khách.</Text>
        )}

        <Button variant="outline" action="neutral" icon="cart-plus" disabled>
          Tạo đơn đặt hàng — sắp có
        </Button>
      </View>
    </Sheet>
  );
}
