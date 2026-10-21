// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useCallback, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { useHistory, useLocation } from 'react-router';
import { Row } from 'antd/lib/grid';
import {
    SettingOutlined,
    InfoCircleOutlined,
    LoadingOutlined,
    LogoutOutlined,
    ControlOutlined,
    UserOutlined,
    TeamOutlined,
    PlusOutlined,
    MailOutlined,
    FolderOutlined,
    ProfileOutlined,
    CheckSquareOutlined,
    CloudOutlined,
    HistoryOutlined,
    BarChartOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    UpOutlined,
} from '@ant-design/icons';
import Layout from 'antd/lib/layout';
import Menu, { MenuProps } from 'antd/lib/menu';
import Avatar from 'antd/lib/avatar';
import Button from 'antd/lib/button';
import Dropdown from 'antd/lib/dropdown';
import Modal from 'antd/lib/modal';
import Text from 'antd/lib/typography/Text';

import { BRAND_FULL_NAME } from 'branding';

import { Organization } from 'cvat-core-wrapper';
import CVATLogo from 'components/common/cvat-logo';
import { switchSettingsModalVisible as switchSettingsModalVisibleAction } from 'actions/settings-actions';
import { logoutAsync } from 'actions/auth-actions';
import { shortcutsActions, registerComponentShortcuts } from 'actions/shortcuts-actions';
import { getOrganizationsAsync, organizationActions } from 'actions/organization-actions';
import { AboutState, CombinedState } from 'reducers';
import { useIsMounted, usePlugins } from 'utils/hooks';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { subKeyMap } from 'utils/component-subkeymap';
import SettingsModal from './settings-modal/settings-modal';

interface StateToProps {
    user: any;
    about: AboutState;
    keyMap: KeyMap;
    switchSettingsShortcut: string;
    settingsModalVisible: boolean;
    shortcutsModalVisible: boolean;
    changePasswordDialogShown: boolean;
    logoutFetching: boolean;
    isAnalyticsPluginActive: boolean;
    organizationFetching: boolean;
    currentOrganization: any | null;
    organizationsList: Organization[];
    organizationsListFetching: boolean;
    organizationsListSearch: string;
    organizationsListPage: number;
}

interface DispatchToProps {
    onLogout: () => void;
    switchSettingsModalVisible: (visible: boolean) => void;
    switchShortcutsModalVisible: (visible: boolean) => void;
    fetchOrganizations: () => void;
    openSelectOrganizationModal: (onSelectOrgCallback: (org: Organization | null) => void) => void;
}

const componentShortcuts = {
    SWITCH_SHORTCUTS: {
        name: 'Show shortcuts',
        description: 'Open/hide the list of available shortcuts',
        sequences: ['f1'],
        scope: ShortcutScope.GENERAL,
    },
    SWITCH_SETTINGS: {
        name: 'Show settings',
        description: 'Open/hide settings dialog',
        sequences: ['f2'],
        scope: ShortcutScope.GENERAL,
    },
};

registerComponentShortcuts(componentShortcuts);

function mapStateToProps(state: CombinedState): StateToProps {
    const {
        auth: {
            user,
            fetching: logoutFetching,
            showChangePasswordDialog: changePasswordDialogShown,
        },
        plugins: { list },
        about,
        shortcuts: { normalizedKeyMap, keyMap, visibleShortcutsHelp: shortcutsModalVisible },
        settings: { showDialog: settingsModalVisible },
        organizations: {
            fetching: organizationFetching,
            current: currentOrganization,
            currentArray: organizationsList,
            currentArrayFetching: organizationsListFetching,
            gettingQuery: {
                search: organizationsListSearch,
                page: organizationsListPage,
            },
        },
    } = state;

    return {
        user,
        about,
        switchSettingsShortcut: normalizedKeyMap.SWITCH_SETTINGS,
        keyMap,
        settingsModalVisible,
        shortcutsModalVisible,
        changePasswordDialogShown,
        logoutFetching,
        isAnalyticsPluginActive: list.ANALYTICS,
        organizationFetching,
        currentOrganization,
        organizationsList,
        organizationsListFetching,
        organizationsListSearch,
        organizationsListPage,
    };
}

function mapDispatchToProps(dispatch: any): DispatchToProps {
    return {
        onLogout: (): void => dispatch(logoutAsync()),
        switchShortcutsModalVisible: (visible: boolean): void => dispatch(
            shortcutsActions.switchShortcutsModalVisible(visible),
        ),
        switchSettingsModalVisible: (visible: boolean): void => dispatch(
            switchSettingsModalVisibleAction(visible),
        ),
        fetchOrganizations: (): void => dispatch(
            getOrganizationsAsync({}),
        ),
        openSelectOrganizationModal: (
            onSelectOrgCallback: (org: Organization | null) => void,
        ): void => dispatch(
            organizationActions.openSelectOrganizationModal(onSelectOrgCallback),
        ),
    };
}

type Props = StateToProps & DispatchToProps;

function HeaderComponent(props: Props): JSX.Element {
    const {
        user,
        about,
        keyMap,
        logoutFetching,
        settingsModalVisible,
        shortcutsModalVisible,
        switchSettingsShortcut,
        isAnalyticsPluginActive,
        organizationFetching,
        currentOrganization,
        organizationsList,
        organizationsListFetching,
        organizationsListSearch,
        organizationsListPage,
        switchSettingsModalVisible,
        switchShortcutsModalVisible,
        fetchOrganizations,
        openSelectOrganizationModal,
    } = props;

    const isMounted = useIsMounted();

    useEffect(() => {
        if (isMounted()) {
            fetchOrganizations();
        }
    }, []);

    const history = useHistory();
    const location = useLocation();

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        SWITCH_SHORTCUTS: (event: KeyboardEvent | undefined) => {
            if (event) event.preventDefault();
            if (!settingsModalVisible) {
                switchShortcutsModalVisible(!shortcutsModalVisible);
            }
        },
        SWITCH_SETTINGS: (event: KeyboardEvent | undefined) => {
            if (event) event.preventDefault();
            if (!shortcutsModalVisible) {
                switchSettingsModalVisible(!settingsModalVisible);
            }
        },
    };

    const aboutPlugins = usePlugins((state: CombinedState) => state.plugins.components.about.links.items, props);
    const aboutLinks: [JSX.Element, number][] = [];
    aboutLinks.push(...aboutPlugins.map(({ component: Component, weight }, index: number) => (
        [<Component key={index} targetProps={props} />, weight] as [JSX.Element, number]
    )));

    const showAboutModal = useCallback((): void => {
        Modal.info({
            title: BRAND_FULL_NAME,
            content: (
                <div>
                    <p>{`${about.server.description}`}</p>
                    <p>
                        <Text type='secondary'>
                            Includes open-source software distributed under the MIT License.
                        </Text>
                    </p>
                    <p>
                        <Text strong>Server version:</Text>
                        <Text type='secondary'>{` ${about.server.version}`}</Text>
                    </p>
                    <p>
                        <Text strong>UI version:</Text>
                        <Text type='secondary'>{` ${about.packageVersion.ui}`}</Text>
                    </p>
                    <Row justify='space-around'>
                        { aboutLinks.sort((item1, item2) => item1[1] - item2[1])
                            .map((item) => item[0]) }
                    </Row>
                </div>
            ),
            width: 640,
            okButtonProps: {
                style: {
                    width: '100px',
                },
            },
        });
    }, [about]);

    const closeSettings = useCallback(() => {
        switchSettingsModalVisible(false);
    }, []);

    const resetOrganization = (): void => {
        localStorage.removeItem('currentOrganization');
        if (/(webhooks)|(\d+)/.test(window.location.pathname)) {
            window.location.pathname = '/';
        } else {
            window.location.reload();
        }
    };

    const setNewOrganization = (organization: Organization | null): void => {
        if (currentOrganization && !organization) {
            resetOrganization();
        } else if (organization && (!currentOrganization || currentOrganization.slug !== organization.slug)) {
            localStorage.setItem('currentOrganization', organization.slug);
            if (/\d+/.test(window.location.pathname)) {
                // a resource is opened (task/job/etc.)
                window.location.pathname = '/';
            } else {
                window.location.reload();
            }
        }
    };

    const plugins = usePlugins((state: CombinedState) => state.plugins.components.header.userMenu.items, props);

    const menuItems: [NonNullable<MenuProps['items']>[0], number][] = [];
    if (user.isStaff) {
        menuItems.push([{
            key: 'admin_page',
            icon: <ControlOutlined />,
            onClick: (): void => {
                window.open('/admin', '_blank');
            },
            label: 'Admin page',
        }, 0]);
    }

    menuItems.push([{
        key: 'profile',
        icon: <UserOutlined />,
        onClick: (): void => {
            history.push('/profile');
        },
        label: 'Profile',
    }, 10]);

    const viewType: 'menu' | 'list' = (organizationsList?.length || 0) > 5 ? 'list' : 'menu';

    menuItems.push([{
        key: 'organization',
        icon: organizationFetching || organizationsListFetching ? <LoadingOutlined /> : <TeamOutlined />,
        label: 'Organization',
        disabled: organizationFetching || organizationsListFetching,
        children: [
            ...(currentOrganization ? [{
                key: 'open_organization',
                icon: <SettingOutlined />,
                label: 'Settings',
                className: 'cvat-header-menu-open-organization',
                onClick: () => history.push('/organization'),
            }] : []), {
                key: 'invitations',
                icon: <MailOutlined />,
                label: 'Invitations',
                className: 'cvat-header-menu-organization-invitations-item',
                onClick: () => history.push('/invitations'),
            }, {
                key: 'create_organization',
                icon: <PlusOutlined />,
                label: 'Create',
                className: 'cvat-header-menu-create-organization',
                onClick: () => history.push('/organizations/create'),
            },
            ...(!!organizationsList && viewType === 'list' ? [{
                key: 'switch_organization',
                label: 'Switch organization',
                onClick: () => {
                    openSelectOrganizationModal(setNewOrganization);
                },
            }] : []),
            ...(!!organizationsList && viewType === 'menu' ? [{
                type: 'divider' as const,
            }, {
                key: '$personal',
                label: 'Personal workspace',
                className: !currentOrganization ? 'cvat-header-menu-active-organization-item' : 'cvat-header-menu-organization-item',
                onClick: resetOrganization,
            }, ...organizationsList.map((organization: Organization) => ({
                key: organization.slug,
                onClick: () => setNewOrganization(organization),
                className: currentOrganization?.slug === organization.slug ? 'cvat-header-menu-active-organization-item' : 'cvat-header-menu-organization-item',
                label: organization.slug,
            }))] : []),
        ],
    }, 20]);

    menuItems.push([{
        key: 'settings',
        icon: <SettingOutlined />,
        onClick: () => switchSettingsModalVisible(true),
        title: `Press ${switchSettingsShortcut} to switch`,
        label: 'Settings',
    }, 30]);

    menuItems.push([{
        key: 'about',
        icon: <InfoCircleOutlined />,
        onClick: () => showAboutModal(),
        label: 'About',
    }, 40]);

    menuItems.push([{
        key: 'logout',
        icon: logoutFetching ? <LoadingOutlined /> : <LogoutOutlined />,
        onClick: () => history.push('/auth/logout'),
        label: 'Logout',
        disabled: logoutFetching,
    }, 50]);

    menuItems.push(...plugins
        .map(({ component, weight }): typeof menuItems[0] => [
            (component as (pluginProps?: any) => NonNullable<MenuProps['items']>[0])({ targetProps: props }),
            weight,
        ]),
    );

    const isAnnotationView = /^\/tasks\/\d+\/jobs\/\d+/.test(location.pathname);
    const [collapsedByUser, setCollapsedByUser] = useState<boolean>(() => {
        try {
            return localStorage.getItem('cvat-sidebar-collapsed') === 'true';
        } catch (_error: unknown) {
            return false;
        }
    });
    // the annotation view needs all the space, so navigation is always compact there
    const collapsed = isAnnotationView || collapsedByUser;
    const toggleCollapsed = (): void => {
        const value = !collapsedByUser;
        setCollapsedByUser(value);
        try {
            localStorage.setItem('cvat-sidebar-collapsed', String(value));
        } catch (_error: unknown) {
            // the choice just won't be remembered
        }
    };

    const navigationItems: { key: string; label: string; icon: JSX.Element; path: string }[] = [
        {
            key: 'projects', label: 'Projects', icon: <FolderOutlined />, path: '/projects',
        },
        {
            key: 'tasks', label: 'Tasks', icon: <ProfileOutlined />, path: '/tasks',
        },
        {
            key: 'jobs', label: 'Jobs', icon: <CheckSquareOutlined />, path: '/jobs',
        },
        {
            key: 'requests', label: 'Requests', icon: <HistoryOutlined />, path: '/requests',
        },
        {
            key: 'cloudstorages', label: 'Cloud storages', icon: <CloudOutlined />, path: '/cloudstorages',
        },
    ];
    const [, firstPathPart] = location.pathname.split('/');
    const selectedKey = navigationItems.find((item) => item.key === firstPathPart)?.key ?? '';

    const workspaceName = currentOrganization ? currentOrganization.slug : 'Personal workspace';
    const userInitial = (user.firstName || user.username || '?').slice(0, 1).toUpperCase();

    return (
        <Layout.Sider
            className={`cvat-header cvat-app-sidebar ${collapsed ? 'cvat-app-sidebar-collapsed' : ''}`}
            width={232}
            collapsedWidth={64}
            collapsed={collapsed}
            trigger={null}
            theme='light'
        >
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
            <div className='cvat-app-sidebar-brand'>
                <a
                    href='/tasks'
                    onClick={(event: React.MouseEvent): void => {
                        event.preventDefault();
                        history.push('/tasks');
                    }}
                >
                    <CVATLogo variant={collapsed ? 'mark' : 'full'} />
                </a>
            </div>

            <Menu
                className='cvat-app-sidebar-menu'
                mode='inline'
                selectedKeys={[selectedKey]}
                inlineCollapsed={collapsed}
                items={[
                    ...navigationItems.map((item) => ({
                        key: item.key,
                        icon: item.icon,
                        className: `cvat-header-${item.key}-button cvat-header-button`,
                        label: (
                            <a
                                href={`${item.path}?page=1`}
                                onClick={(event: React.MouseEvent): void => {
                                    event.preventDefault();
                                    history.push(item.path);
                                }}
                            >
                                {item.label}
                            </a>
                        ),
                    })),
                    ...(isAnalyticsPluginActive && user.hasAnalyticsAccess ? [{
                        key: 'analytics',
                        icon: <BarChartOutlined />,
                        className: 'cvat-header-analytics-button cvat-header-button',
                        label: 'Analytics',
                        onClick: () => window.open('/analytics', '_blank'),
                    }] : []),
                ]}
            />

            <div className='cvat-app-sidebar-footer'>
                {!isAnnotationView && (
                    <Button
                        type='text'
                        className='cvat-app-sidebar-collapse-button'
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={toggleCollapsed}
                    >
                        {collapsed ? null : 'Collapse'}
                    </Button>
                )}
                <Dropdown
                    trigger={['click']}
                    destroyPopupOnHide
                    placement='topLeft'
                    menu={{
                        items: menuItems.sort((menuItem1, menuItem2) => menuItem1[1] - menuItem2[1])
                            .map((menuItem) => menuItem[0]),
                        triggerSubMenuAction: 'click',
                        className: 'cvat-header-menu',
                    }}
                    className='cvat-header-menu-user-dropdown'
                    onOpenChange={(open: boolean) => {
                        if (open && (organizationsListSearch || organizationsListPage !== 1)) {
                            fetchOrganizations();
                        }
                    }}
                >
                    <div className='cvat-app-sidebar-user'>
                        <Avatar size={32} className='cvat-app-sidebar-avatar'>{userInitial}</Avatar>
                        {!collapsed && (
                            <>
                                <div className='cvat-app-sidebar-user-text'>
                                    <Text strong ellipsis className='cvat-header-menu-user-dropdown-user'>
                                        {user.username}
                                    </Text>
                                    <Text
                                        type='secondary'
                                        ellipsis
                                        className='cvat-header-menu-user-dropdown-organization'
                                    >
                                        {workspaceName}
                                    </Text>
                                </div>
                                <UpOutlined className='cvat-app-sidebar-user-caret' />
                            </>
                        )}
                    </div>
                </Dropdown>
            </div>
            <SettingsModal visible={settingsModalVisible} onClose={closeSettings} />
        </Layout.Sider>
    );
}

export default connect(mapStateToProps, mapDispatchToProps)(React.memo(HeaderComponent));
