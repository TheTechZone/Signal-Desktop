import React, { useEffect, useState } from 'react';

import type { LocalizerType } from '../types/Util';
import { SearchInput } from './SearchInput';
import { PanelRow } from './conversation/conversation-details/PanelRow';
import { PanelSection } from './conversation/conversation-details/PanelSection';
import { UUIDStringType } from '../types/UUID';
import { StoredTrustedIntroductionType } from '../sql/Interface';
import { SignalService as Proto } from '../protobuf';
import { formatDateTimeLong } from '../util/timestamp';
import { ContextMenu } from './ContextMenu';
import MessageSender from '../textsecure/SendMessage';
import { singleProtoJobQueue } from '../jobs/singleProtoJobQueue';
import * as log from '../logging/log';
import * as Errors from '../types/errors';

export type PropsDataType = {
    conversationId?: string;
    uuid: UUIDStringType;
    i18n: LocalizerType;
};

function canAccept(intro: StoredTrustedIntroductionType) : boolean {
    // Can only accept "PENDING" introductions
    return intro.state === Proto.Introduced.State.PENDING
        || intro.state === Proto.Introduced.State.REJECTED;
}

function canReject(intro: StoredTrustedIntroductionType) : boolean {
    return intro.state === Proto.Introduced.State.PENDING
        || intro.state === Proto.Introduced.State.ACCEPTED;
}

function buildOptions(intro: StoredTrustedIntroductionType, idx:number, updateFn: (idx: number, intro: StoredTrustedIntroductionType | null) => void) {
    let menuOptions = [
        {
            label: "Delete",
            onClick: async () => {
                await window.Signal.Data.deleteIntroduction(intro._id);
                updateFn(idx, null);
                _syncIntroUpdate(intro, Proto.Introduced.SyncType.DELETED);
            },
        },
    ]
    if(!!intro.introducer_service_id){
        menuOptions.unshift({
            label: "Mask",
            onClick: async () => {
                console.log("TODO: implement mask");
                await window.Signal.Data.maskIntroduction(intro._id);
                intro.introducer_service_id = "";
                updateFn(idx, intro);
                _syncIntroUpdate(intro, Proto.Introduced.SyncType.MASKED);
            },
        })
    }
    if(canReject(intro)){
        menuOptions.unshift(
            {
                label: "Reject",
                onClick: async () => {
                    console.log("TODO: implement reject");
                    await window.Signal.Data.changeIntroductionState(intro._id, Proto.Introduced.State.REJECTED);
                    intro.state = Proto.Introduced.State.REJECTED;
                    updateFn(idx, intro);
                    _syncIntroUpdate(intro, Proto.Introduced.SyncType.UPDATED_STATE);
                }
            }
        );
    }
    if(canAccept(intro)) {
        menuOptions.unshift({
            label: "Accept",
            onClick: async () => {
                console.log("TODO: implement accept");

                const convo = window.ConversationController.get(intro.introducee_service_id);
                if(!convo){
                    console.warn(`failed to retrieve convo with uid ${intro.introducee_service_id} from intro with id ${intro._id}`)
                    return;
                }
                
                // update state
                await convo.setIntroduced()
                    .then((result) => console.log("got result: ", result))
                    .catch(error => console.error(error));
                // and the introduction
                await window.Signal.Data.changeIntroductionState(intro._id, Proto.Introduced.State.ACCEPTED);
                intro.state = Proto.Introduced.State.ACCEPTED;
                updateFn(idx, intro);
                // todo: update verification state
                _syncIntroUpdate(intro, Proto.Introduced.SyncType.UPDATED_STATE);
            }
        });
    }
    return menuOptions;
}

async function _syncIntroUpdate(newIntro: StoredTrustedIntroductionType, updateType: Proto.Introduced.SyncType) {
    const msg = MessageSender.getIntroductionSync(newIntro.introducee_service_id, updateType, newIntro);
    try {
        await singleProtoJobQueue.add(msg);
    } catch (error) {
        log.error(
            'sendIntroSyncMessage: Failed to queue sync message',
            Errors.toLogFormat(error)
        );
    }
}

export function TrustedIntroductions({
    conversationId,
    uuid,
    i18n
}: PropsDataType): JSX.Element {
    const [searchTerm, setSearchTerm] = useState('');
    const hasIntroductions = true;
    const [showAll, setShowAll] = useState(false);
    const [intros, setIntros ]= useState<StoredTrustedIntroductionType[]>([]);

    const updateIntroById = async (idx: number, intro: StoredTrustedIntroductionType | null ) => {
        if(intro === null) {
            intros.splice(idx,1);
        }else {
            intros[idx] = intro;
        }
        setIntros([...intros]);
    }

    useEffect(() =>  {
        const getIntros = async () => {
            let introductions: StoredTrustedIntroductionType[];
            if(showAll){
                introductions = await window.Signal.Data.getAllIntroductions();
            }else {
                introductions = await window.Signal.Data.getIntroductionsFrom(uuid);
            }
            setIntros(introductions);
        }
        getIntros().catch(console.error);
    }, [uuid, showAll]);
    useEffect(() => {
        console.debug("intros got updated");
        // currentUser changed
      }, [intros]);

    
    //   intros.reduce((introducer, intro) => {
    //     const {introducer_service_id} = intro; 
    //     introducer[introducer_service_id] =  introducer[introducer_service_id] ?? []; 
    //     introducer[introducer_service_id].push(intro); 
    //     return introducer;  }, {}

    console.log("INTROS",intros);
    return (
        <div className="TrustedIntroductions__container">
            {!showAll ? (
                    <p>Trusted intros for conversation: {conversationId} (serviceId: {uuid})</p>
                ): (
                    <p>All introductions</p>
                )
            }
            <SearchInput i18n={i18n}
                disabled={!hasIntroductions}        
                placeholder={i18n('icu:contactSearchPlaceholder')}
                moduleClassName="TrustedIntroductions__search"
                onChange={event => {
                    setSearchTerm(event.target.value);
                }}
                value={searchTerm}
            />
            <hr />
            <PanelSection>
            {
                intros && intros.length > 0 &&
                intros.map((intro, index) => {
                    return (
                        <PanelRow
                            key={index}
                            label={intro.introducee_name}
                            info={intro.introducee_number}
                            right={
                                <div>
                                    <div>{formatDateTimeLong(i18n,intro.timestamp)}</div>
                                    <div>{Proto.Introduced.State[intro.state]}</div>
                                    <div>From: { intro.introducer_service_id ? intro.introducer_service_id : "(masked)"}</div>
                                </div>
                            }
                            actions={
                               <ContextMenu
                                    i18n={i18n}
                                    moduleClassName=""
                                    menuOptions={buildOptions(intro, index, updateIntroById)}
                                    popperOptions={{
                                        placement: 'bottom',
                                        strategy: 'absolute',
                                    }}
                                >
                                    {/* <div> */}
                                        <div role='button'>Menu</div>
                                    {/* </div> */}
                                </ContextMenu>
                                // </div>
                            }
                        />
                        // <div key={index}>
                        //     <p>Intro for {intro.introducee_name} ({Proto.Introduced.State[intro.state]})</p>
                        //     <p>{intro.introducee_number}</p>
                        //     <p>{intro.predicted_fingerprint}</p>
                        // </div>
                    )
                })
            }
            </PanelSection>
            <hr />
            <PanelRow
                label={showAll? `Introductions from ${uuid}` : "All introductions"}
                onClick={() => {
                    setShowAll(!showAll);
                }}
            />
        </div>
    );
}