import { createStore, combineReducers, applyMiddleware, compose } from 'redux';
import { taskMiddleware } from 'react-palm/tasks';
import keplerGlReducer from '@kepler.gl/reducers';

// Minimal kepler.gl redux store. kepler mounts under the `keplerGl` key.
const reducer = combineReducers({
  keplerGl: keplerGlReducer,
});

const composeEnhancers =
  (typeof window !== 'undefined' &&
    (window as unknown as { __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: typeof compose })
      .__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) ||
  compose;

export const store = createStore(
  reducer,
  {},
  composeEnhancers(applyMiddleware(taskMiddleware)),
);

export type RootState = ReturnType<typeof reducer>;
