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
      <div className="page-header">
        <h1 className="text-xl font-bold mb-0" style={{ color: 'var(--text-white)' }}>
          Directories
        </h1>
        {/* Tabs */}
        <div className="page-tabs overflow-x-auto scrollbar-none -mb-px" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-button ${isActive ? 'active' : ''} flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0`}
                style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)', background: 'transparent' }}
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
