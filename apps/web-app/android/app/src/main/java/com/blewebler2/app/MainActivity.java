package com.blewebler2.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BleWeblerClassicPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
