import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AccountState } from './types';

const initialState: AccountState = {
  experience: 0,
};

const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    addExperience: (state, action: PayloadAction<number>) => {
      state.experience += action.payload;
    },
  },
});

export const { addExperience } = accountSlice.actions;
export const accountReducer = accountSlice.reducer;
