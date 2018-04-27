import {createAsyncAction, createReducer} from 'redux-action-tools';
const debug = require('debug')('butter-redux-actions')

const id = (m) => (m)

export default class ButterReduxProvider {
    constructor(provider) {
        let Instance, config

        switch(typeof provider) {
            case 'function':
                Instance = provider
                break;
            case 'string':
            default:
                Instance = require(`butter-provider-${provider}`)
        }

        this.provider = new Instance()
        // HACK: bind all method exported to the provider
        Array.from(['fetch', 'detail', 'random']).map(method => {
            this.provider[method] = this.provider[method].bind(this.provider)
        })

        this.config = Object.assign({}, config, this.provider.config)
        let uniqueId = this.config.uniqueId

        const hashify = (source) => (
            source.reduce((a, c) => (
                Object.assign(a, {
                    [c[uniqueId]]: c
                })
            ), {})
        )

        const addToHash = (state, items) => ({
            ...state,
            ...hashify(items)
        })

        const creators = {
            FETCH: {
                payloadCreator: (syncPayload, dispatch, getState) => {
                    const {filters} = getState()

                    return this.provider.fetch(filters)
                },
                handler: (state, {payload}) => {
                    let {results} = payload

                    return {
                        ...state,
                        cache: addToHash(state.cache, results),
                        fetched: true,
                        items: results.map(i => i[uniqueId]),
                    }
                }
            },
            DETAIL: {
                payloadCreator: (id, dispatch, getState) => {
                    const {cache} = getState()
                    return this.provider.detail(id, cache ? cache[id]: {})
                },
                handler: (state, {payload}) => {
                    let id = payload[uniqueId]

                    return {
                        ...state,
                        cache: addToHash(state.cache, [{
                            [id]: payload
                        }]),
                        detail: id,
                    }

                }
            },
            RANDOM: {
                payloadCreator: (syncPayload, dispatch, getState) => {
                    debug('calling', this.provider.random)

                    return this.provider.random()
                },
                handler: (state, {payload}) => {
                    let id = payload[uniqueId]

                    return {
                        ...state,
                        cache: addToHash(state.cache, [{
                            [id]: payload
                        }]),
                        random: id
                    }
                }
            },
            UPDATE: {
                payloadCreator: (syncPayload, dispatch, getState) => (
                    this.provider.update()
                ),
                handler: (state, {payload}) => ({
                    ...state,
                    lastUpdated: payload?Date.now():state.lastUpdated
                })
            }
        }

        const upperName = this.config.name.toUpperCase()
        const actionKeys = Object.keys(creators)
        this.actionTypes = actionKeys.reduce((a, t) => (Object.assign(a, {
            [t]: `BUTTER/PROVIDERS/${upperName}/${t}`
        })), {})

        this.actions = actionKeys.reduce((a, t) => {
            let creator = creators[t]

            return Object.assign(a, {
                [t]: createAsyncAction(
                    this.actionTypes[t],
                    creator.payloadCreator
                )
            })
        }, {})

        debug('ACTIONS', this.actions)

        const handlers = actionKeys.reduce((a, t) => {
            const reducer = createReducer()
                .when(this.actionTypes[t], (state, {type}) => ({
                    ...state,
                    isFetching: type || true}))
                .done((state, action) => (
                    creators[t].handler({
                        ...state,
                        isFetching: false
                    }, action)))
                .build({})

            return Object.assign(a, {
                [this.actionTypes[t]]: reducer,
                [this.actionTypes[t] + '_COMPLETED']: reducer
            })
        }, {})

        this.reducer = (state, action) => {
            const handler = handlers[action.type]

            if (handler) {
                return handler(state, action)
            }

            debug('no handler found for:', action, 'in my', handlers)
            return {
                ...state,
                isFetching: false,
                fetched: false,
                detail: null,
                random: null,
                lastUpdated: null,
                items: [],
                cache: {}
            }
        }

        debug('REDUCERS', this.handlers)
    }

    debug() {
        debug(this.config.name, ...arguments)
    }
}
