import { connect } from 'react-redux';

import { mapDispatchToProps } from '../actions';
import type { PropsDataType } from '../../components/TrustedIntroductions';
import { TrustedIntroductions } from "../../components/TrustedIntroductions";
import type { StateType } from '../reducer';
import {
    getConversationSelector,
} from '../selectors/conversations';
import { getIntl } from '../selectors/user';
import { UUIDStringType } from '../../types/UUID';
import { ConversationType } from '../ducks/conversations';


export type SmartTrustedIntroductionsProps = {
    // TODO: determine state we need....
    conversationId?: string;
    uuid?: UUIDStringType;
};  

const mapStateToProps = (
    state: StateType,
    props: SmartTrustedIntroductionsProps
): PropsDataType => {
    const conversation: ConversationType = getConversationSelector(state)(props.conversationId);

    console.log("current convo:", conversation);
    return {
        ...props,
        uuid: conversation.uuid!, // a bit hacky
        i18n: getIntl(state),
    };
}

const smart = connect(mapStateToProps, mapDispatchToProps);
export const SmartTrustedIntroductions = smart(TrustedIntroductions);
