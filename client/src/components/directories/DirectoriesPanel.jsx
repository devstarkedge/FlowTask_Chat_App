import { useState } from 'react'
import { Users, Hash, UsersRound, Globe, Mail } from 'lucide-react'
import PeopleTab from './PeopleTab'
import ChannelsTab from './ChannelsTab'
import UserGroupsTab from './UserGroupsTab'
import ExternalTab from './ExternalTab'
import InvitationsTab from './InvitationsTab'

const TABS = [
  { id: 'people', label: 'People', icon: Users },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'userGroups', label: 'User Groups', icon: UsersRound },
  { id: 'external', label: 'External', icon: Globe },
  { id: 'invitations', label: 'Invitations', icon: Mail },
]

export default function DirectoriesPanel() {
  const [activeTab, setActiveTab] = useState('people')

  return (
    <section className="flex-1 min-w-0 flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="shrink-0 px-5 pt-5 pb-0"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <h1 className="text-xl font-bold mb-4" style={{ color: 'var(--text-white)' }}>
          Directories
        </h1>
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none -mb-px">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0"
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                }}
              >
                <tab.icon size={16} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ animation: 'fadeIn 0.2s ease' }} key={activeTab}>
        {activeTab === 'people' && <PeopleTab />}
        {activeTab === 'channels' && <ChannelsTab />}
        {activeTab === 'userGroups' && <UserGroupsTab />}
        {activeTab === 'external' && <ExternalTab />}
        {activeTab === 'invitations' && <InvitationsTab />}
      </div>
    </section>
  )
}
