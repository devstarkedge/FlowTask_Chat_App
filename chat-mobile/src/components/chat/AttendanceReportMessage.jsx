import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppAvatar from '../common/AppAvatar';
import ReportingHistory from './ReportingHistory';
import { reportPresentation } from '../../utils/attendanceReport';
import { useReportingHistoryStore } from '../../stores/reportingHistoryStore';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useThemeStore } from '../../stores/themeStore';

export default function AttendanceReportMessage({ message, colors }) {
  const [initialWork, setInitialWork] = useState(null);
  const revision = useReportingHistoryStore(state => state.revision);
  const viewerId = useAuthStore(state => state.user?._id);
  const workspaceId = useWorkspaceStore(state => state.activeWorkspaceId);
  const dark = useThemeStore(state => state.effectiveTheme === 'dark');
  const valid = initialWork?.revision === revision && initialWork?.viewerId === viewerId && initialWork?.workspaceId === workspaceId;
  const report = reportPresentation({ ...message, reportingHistory: valid ? { canView: true, initialWork } : null });
  if (message.isDeleted || message.reportingMeta?.leaveRetracted) return null;
  if (!['attendance.checked_in', 'attendance.checked_out', 'leave.daily_report'].includes(message.reportingMeta?.eventType)) return null;
  const employee = message.reportingEmployee || { _id: message.reportingMeta?.employeeId, name: report.employee };
  const text = { color: colors.textPrimary, fontSize: 13, lineHeight: 18 };
  const checkedIn = message.reportingMeta?.eventType === 'attendance.checked_in';
  return <View accessibilityLabel={report.title + ' by ' + report.employee} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
    <View style={styles.header}>
      <AppAvatar member={employee} size={28} showStatus={false}/>
      <View style={styles.person}>
        <View style={styles.nameRow}>
          <Text style={[text, styles.bold]}>{employee.name || report.employee}</Text>
          <Text style={[text, styles.bold, { color: checkedIn ? (dark ? '#4ade80' : '#15803d') : colors.primary }]}>{report.title}</Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{report.date}</Text>
      </View>
      {!!report.time && <Text style={[text, styles.bold]}>{report.time}</Text>}
    </View>
    {report.details.map((detail, index) => <View key={index} style={[styles.row, detail.total && { borderTopWidth: 1, borderColor: colors.border, paddingTop: 6, marginTop: 3 }]}>
      {detail.total ? <Text style={[text, styles.bold]}>{detail.label} - {detail.value}</Text> : <>
        {!!detail.label && <Text style={{ color: colors.textSecondary, fontSize: 12, width: 80 }}>{detail.label}</Text>}
        <Text style={[text, { flex: 1, flexShrink: 1 }]}>{detail.value}</Text>
      </>}
    </View>)}
    {checkedIn && <ReportingHistory message={message} present={reportPresentation} onInitialWork={setInitialWork} colors={colors}/>}
  </View>;
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', maxWidth: 520, marginHorizontal: 12, marginVertical: 6, padding: 10, borderWidth: 1, borderRadius: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  person: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  bold: { fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
