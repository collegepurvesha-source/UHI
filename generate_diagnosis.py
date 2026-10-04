import pandas as pd
import numpy as np
import json
import geopandas as gpd

# Load the existing data
df = pd.read_csv('Bengaluru_wards_LST_NDVI_NDBI_NDWI_2026_04_25.csv')

# Reference values
CITY_LST = 42.33

# Create output dataframe
out = df.copy()

# 1. Calculate relative heat anomaly
out['lst_anomaly_C'] = out['LST_mean_C'] - CITY_LST

# 2. Classify indicator signals (using percentiles or absolute thresholds for Bengaluru)
# Using median as a simple threshold for high/low signal for this prototype
ndbi_median = out['NDBI_mean'].median()
ndvi_median = out['NDVI_mean'].median()
ndwi_median = out['NDWI_mean'].median()

# Assign risk categories
out['built_up_risk'] = np.where(out['NDBI_mean'] > ndbi_median, 'High', 'Low')
out['vegetation_deficit'] = np.where(out['NDVI_mean'] < ndvi_median, 'High', 'Low')
out['wetness_signal'] = np.where(out['NDWI_mean'] < ndwi_median, 'Low', 'Moderate')
out['heat_class'] = np.where(out['lst_anomaly_C'] > 1.0, 'Extreme', 
                             np.where(out['lst_anomaly_C'] > 0, 'Hot', 'Average/Cool'))

# 3. Diagnosis Engine Rules
def assign_diagnosis(row):
    # Rule 1: High LST + High NDBI + Low NDVI
    if row['lst_anomaly_C'] > 0 and row['built_up_risk'] == 'High' and row['vegetation_deficit'] == 'High':
        return pd.Series([
            'High-priority combined heat hotspot',
            'High built-up surface signal',
            'Low vegetation signal',
            'Very High',
            'Roof, pavement, canopy and commercial-building audit',
            'Cool roofs + tree canopy + shaded parking + pavement changes',
            'Lower roof/pavement temperature, shade improvement, lower cooling demand',
            'Glass ratio, AC waste heat and road density are not measured in current data'
        ])
    # Rule 2: High LST + High NDBI
    elif row['lst_anomaly_C'] > 0 and row['built_up_risk'] == 'High':
        return pd.Series([
            'Built-up surface dominated heat',
            'Built-up/impervious heat absorption',
            'None',
            'High',
            'Map roofs, asphalt, parking, dense commercial parcels',
            'Cool roofs, pavement shading, reflective/permeable surfaces',
            'Lower surface temperatures, reduced heat absorption',
            'Roof materials and specific built structures are unknown'
        ])
    # Rule 3: High LST + Low NDVI
    elif row['lst_anomaly_C'] > 0 and row['vegetation_deficit'] == 'High':
        return pd.Series([
            'Low vegetation/shade heat',
            'Low shade and evapotranspiration',
            'None',
            'High',
            'Identify canopy-poor roads, schools, markets, bus stops',
            'Native trees, pocket parks, shaded walkways',
            'Improved shading, higher evapotranspiration cooling',
            'Exact tree canopy locations need verification'
        ])
    # Rule 4: High LST + Low NDWI
    elif row['lst_anomaly_C'] > 0 and row['wetness_signal'] == 'Low':
        return pd.Series([
            'Potential moisture-deficit zone',
            'Limited visible wetness/moisture signal',
            'None',
            'Medium',
            'Verify lakes, drains, soil sealing, runoff',
            'Blue-green infrastructure, rain gardens, permeable areas',
            'Improved stormwater retention and local cooling',
            'Does not directly measure drinking water or groundwater scarcity'
        ])
    # Rule 5: High LST but missing clear indicators
    elif row['lst_anomaly_C'] > 0:
         return pd.Series([
            'Data-insufficient hotspot',
            'Unknown',
            'Unknown',
            'Low',
            'Comprehensive field/building audit required',
            'Pending audit results',
            'TBD',
            'Current satellite indicators do not explain this heat pattern'
        ])
    else:
        return pd.Series([
            'Cooler than city average',
            'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'
        ])

# Apply the rules
new_cols = ['diagnostic_class', 'primary_driver', 'secondary_driver', 
            'evidence_confidence', 'recommended_audit', 'intervention_package', 
            'expected_benefit_type', 'limitations']
out[new_cols] = out.apply(assign_diagnosis, axis=1)

# 4. Priority Score calculation (Percentile based)
# Normalize variables between 0 and 1
def normalize(series):
    return (series - series.min()) / (series.max() - series.min())

norm_lst = normalize(out['LST_mean_C'])
norm_ndbi = normalize(out['NDBI_mean'])
norm_ndvi_inv = 1 - normalize(out['NDVI_mean']) # Invert so low NDVI = high deficit
norm_ndwi_inv = 1 - normalize(out['NDWI_mean']) # Invert so low NDWI = high deficit

# Calculate score
out['priority_score'] = (0.45 * norm_lst + 
                         0.30 * norm_ndbi + 
                         0.20 * norm_ndvi_inv + 
                         0.05 * norm_ndwi_inv)
out['priority_score'] = out['priority_score'].round(3)

# Save the diagnostic CSV
out.to_csv('Bengaluru_ward_heat_diagnosis_2026.csv', index=False)

# Optional: If you have a GeoJSON to merge with, here's how you'd do it
try:
    gdf = gpd.read_file('Bengaluru_wards_LST_NDVI_NDBI_NDWI_2026_04_25.geojson')
    # Assuming 'WARD_NO' is the common column
    if 'WARD_NO' in gdf.columns and 'WARD_NO' in out.columns:
        gdf_out = gdf.merge(out[new_cols + ['lst_anomaly_C', 'built_up_risk', 'vegetation_deficit', 'wetness_signal', 'heat_class', 'priority_score']], on='WARD_NO')
        gdf_out.to_file('Bengaluru_ward_heat_diagnosis_2026.geojson', driver='GeoJSON')
except:
    pass

print('Diagnostic script generated!')
